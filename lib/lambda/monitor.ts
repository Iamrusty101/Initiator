import {
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import {
  DynamoDBClient,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';

import {
  CloudWatchClient,
  PutMetricDataCommand,
} from '@aws-sdk/client-cloudwatch';

const dynamoDB = new DynamoDBClient({});
const s3 = new S3Client({});
const cloudWatch = new CloudWatchClient({});

interface Site {
  name: string;
  url: string;
}

interface SiteResult {
  site: string;
  url: string;
  available: boolean;
  latencyMs: number | null;
  statusCode: number | null;
  error?: string;
}

async function recordIncident(result: Site): Promise<void> {
  const tableName = process.env.INCIDENT_TABLE;

  if (!tableName) {
    throw new Error('INCIDENT_TABLE environment variable is not configured');
  }

  await dynamoDB.send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        incidentId: {
          S: `${result.name}-${Date.now()}`,
        },
        site: {
          S: result.name,
        },
        url: {
          S: result.url,
        },
        timestamp: {
          S: new Date().toISOString(),
        },
      },
    }),
  );
}

async function getSites(): Promise<Site[]> {
  const bucketName = process.env.SITES_BUCKET;

  if (!bucketName) {
    throw new Error('SITES_BUCKET environment variable is not configured');
  }

  const response = await s3.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: 'sites.json',
    }),
  );

  if (!response.Body) {
    throw new Error('sites.json was not found in S3');
  }

  const body = await response.Body.transformToString();

  const config = JSON.parse(body) as { sites: Site[] };

  return config.sites;
}

async function publishMetrics(
  site: Site,
  available: boolean,
  latencyMs: number,
): Promise<void> {
  await cloudWatch.send(
    new PutMetricDataCommand({
      Namespace: 'Initiator/Monitoring',
      MetricData: [
        {
          MetricName: 'Availability',
          Dimensions: [
            {
              Name: 'Site',
              Value: site.name,
            },
          ],
          Value: available ? 1 : 0,
          Unit: 'Count',
        },
        {
          MetricName: 'Latency',
          Dimensions: [
            {
              Name: 'Site',
              Value: site.name,
            },
          ],
          Value: latencyMs,
          Unit: 'Milliseconds',
        },
      ],
    }),
  );
}

async function checkSite(site: Site): Promise<SiteResult> {
  const start = Date.now();

  try {
    const response = await fetch(site.url, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });

    const latencyMs = Date.now() - start;
    const available = response.ok;

    await publishMetrics(
      site,
      available,
      latencyMs,
    );

    if (!available) {
      await recordIncident(site);
    }

    return {
      site: site.name,
      url: site.url,
      available,
      latencyMs,
      statusCode: response.status,
    };

  } catch (error) {
    const latencyMs = Date.now() - start;

    await publishMetrics(
      site,
      false,
      latencyMs,
    );

    await recordIncident(site);

    return {
      site: site.name,
      url: site.url,
      available: false,
      latencyMs,
      statusCode: null,
      error: error instanceof Error
        ? error.message
        : String(error),
    };
  }
}

export async function handler() {
  const sites = await getSites();

  const results = await Promise.all(
    sites.map((site) => checkSite(site)),
  );

  console.log(JSON.stringify(results));

  return results;
}
