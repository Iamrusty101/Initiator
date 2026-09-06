#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { InitiatorAwsMonitorStack } from '../lib/initiator-aws-monitor-stack';

const app = new cdk.App();

const account = process.env.CDK_DEFAULT_ACCOUNT;

new InitiatorAwsMonitorStack(app, 'InitiatorAwsMonitorSydney', {
  env: {
    account,
    region: 'ap-southeast-2',
  },
});

new InitiatorAwsMonitorStack(app, 'InitiatorAwsMonitorSingapore', {
  env: {
    account,
    region: 'ap-southeast-1',
  },
});