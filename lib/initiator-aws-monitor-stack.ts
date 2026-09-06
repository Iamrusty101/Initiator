import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class InitiatorAwsMonitorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const sitesBucket = new s3.Bucket(this, 'SitesBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const incidentTable = new dynamodb.Table(this, 'IncidentTable', {
      partitionKey: {
        name: 'incidentId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new s3deploy.BucketDeployment(this, 'SitesConfigDeployment', {
      sources: [
        s3deploy.Source.asset('config'),
      ],
      destinationBucket: sitesBucket,
    });

    const monitorFunction = new lambda.Function(this, 'MonitorFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'monitor.handler',
      code: lambda.Code.fromAsset('dist/lib/lambda'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        SITES_BUCKET: sitesBucket.bucketName,
        INCIDENT_TABLE: incidentTable.tableName,
      },
    });
    incidentTable.grantWriteData(monitorFunction);


    sitesBucket.grantRead(monitorFunction);
    const monitorRule = new events.Rule(this, 'MonitorSchedule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
    });

    monitorRule.addTarget(
      new targets.LambdaFunction(monitorFunction),
    );

    monitorFunction.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
      }),
    );

    const availabilityMetric = new cloudwatch.Metric({
      namespace: 'Initiator/Monitoring',
      metricName: 'Availability',
      dimensionsMap: {
        Site: 'Example',
      },
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
    });

    const latencyMetric = new cloudwatch.Metric({
      namespace: 'Initiator/Monitoring',
      metricName: 'Latency',
      dimensionsMap: {
        Site: 'Example',
      },
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
    });

      const dashboard = new cloudwatch.Dashboard(this, 'InitiatorDashboard', {
        dashboardName: `Initiator-${this.region}`,
      });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: `Website Availability - ${this.region}`,
        left: [availabilityMetric],
        width: 12,
        height: 6,
        leftYAxis: {
          min: 0,
          max: 1,
        },
      }),
    
      new cloudwatch.GraphWidget({
        title: `Website Latency - ${this.region}`,
        left: [latencyMetric],
        width: 12,
        height: 6,
      }),
    );

    const lambdaInvocations = monitorFunction.metricInvocations({
      period: cdk.Duration.minutes(1),
      statistic: 'Sum',
    });

    const lambdaErrors = monitorFunction.metricErrors({
      period: cdk.Duration.minutes(1),
      statistic: 'Sum',
    });

    const lambdaDuration = monitorFunction.metricDuration({
      period: cdk.Duration.minutes(1),
      statistic: 'Average',
    });

      dashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: 'Lambda Invocations',
          left: [lambdaInvocations],
          width: 8,
          height: 6,
        }),
      
        new cloudwatch.GraphWidget({
          title: 'Lambda Errors',
          left: [lambdaErrors],
          width: 8,
          height: 6,
        }),
      
        new cloudwatch.GraphWidget({
          title: 'Lambda Duration',
          left: [lambdaDuration],
          width: 8,
          height: 6,
        }),
      );
      const alertTopic = new sns.Topic(this, 'InitiatorAlertTopic', {
  displayName: `Initiator Alerts ${this.region}`,
});

const availabilityAlarm = new cloudwatch.Alarm(this, 'AvailabilityAlarm', {
  metric: availabilityMetric,
  threshold: 1,
  evaluationPeriods: 1,
  comparisonOperator:
    cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
  treatMissingData: cloudwatch.TreatMissingData.BREACHING,
});

availabilityAlarm.addAlarmAction(
  new cloudwatch_actions.SnsAction(alertTopic)
);

const latencyAlarm = new cloudwatch.Alarm(this, 'LatencyAlarm', {
  metric: latencyMetric,
  threshold: 2000,
  evaluationPeriods: 1,
  comparisonOperator:
    cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
});

latencyAlarm.addAlarmAction(
  new cloudwatch_actions.SnsAction(alertTopic)
);

new cdk.CfnOutput(this, 'AlertTopicArn', {
  value: alertTopic.topicArn,
});

    new cdk.CfnOutput(this, 'SitesBucketName', {
      value: sitesBucket.bucketName,
      description: 'S3 bucket containing Initiator website configuration',
    });

    new cdk.CfnOutput(this, 'MonitorFunctionName', {
      value: monitorFunction.functionName,
      description: 'Initiator website monitoring Lambda function',
    });
  }
}
