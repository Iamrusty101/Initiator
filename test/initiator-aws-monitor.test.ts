import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { InitiatorAwsMonitorStack } from '../lib/initiator-aws-monitor-stack';

test('Initiator creates a private S3 bucket', () => {
  const app = new cdk.App();

  const stack = new InitiatorAwsMonitorStack(app, 'TestStack');

  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::S3::Bucket', 1);

  template.hasResourceProperties('AWS::S3::Bucket', {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
  });
});