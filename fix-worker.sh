#!/bin/bash
set -e

TMPFILE=$(mktemp /tmp/worker-td.XXXXXX.json)

aws ecs describe-task-definition --task-definition abhiyan-worker --query taskDefinition \
  | jq '{family,containerDefinitions,requiresCompatibilities,networkMode,cpu,memory,executionRoleArn,taskRoleArn} | .containerDefinitions[0].secrets |= map(select(.name != "BROKER_URL"))' \
  > "$TMPFILE"

NEW_REV=$(aws ecs register-task-definition --cli-input-json "file://$TMPFILE" \
  --query 'taskDefinition.taskDefinitionArn' --output text)

echo "Registered: $NEW_REV"

aws ecs update-service --cluster abhiyan-prod --service abhiyan-worker --task-definition "$NEW_REV" --output text

echo "Done. Worker will restart shortly."
