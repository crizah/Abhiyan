DB_URL         ?= postgres://postgres:password@localhost:5432/abhiyan_dev?sslmode=disable
MIGRATIONS_DIR  = server/internal/db/migrations
BUILD_DIR = server/cmd/api
BINARY          = abhiyan
SSM_PREFIX      = /abhiyan/prod
type           ?= SecureString

build:
	cd server && GOOS=linux go build -o $(BINARY) cmd/api/main.go

run:
	chmod +x server/$(BINARY)
	cd server && ./$(BINARY)

# Diffs schemas/ against the current DB and generates a migration file.
# Atlas spins up a temporary Docker container as scratch — no second DB needed.
# usage: make migrate-create name=add_column_foo
migrate-create:
	atlas migrate diff $(name) \
		--dir "file://$(MIGRATIONS_DIR)" \
		--to "file://server/internal/db/schemas" \
		--dev-url "docker://postgres/15/dev"

migrate-up:
	atlas migrate apply \
		--dir "file://$(MIGRATIONS_DIR)" \
		--url "$(DB_URL)" \
		--revisions-schema public

migrate-down:
	atlas migrate down 1 \
		--dir "file://$(MIGRATIONS_DIR)" \
		--url "$(DB_URL)" \
		--dev-url "docker://postgres/15/dev" \
		--revisions-schema public

migrate-status:
	atlas migrate status \
		--dir "file://$(MIGRATIONS_DIR)" \
		--url "$(DB_URL)" \
		--revisions-schema public
unfuck-atlas:
	atlas migrate hash --dir "file://server/internal/db/migrations"

# Sanity-checks the multi-org membership backfill. Defaults to dev (DB_URL);
# pass a different one for prod, e.g.:
#   make verify-multi-org DB_URL="postgres://user:pass@prod-host:5432/abhiyan_prod?sslmode=require"
verify-multi-org:
	psql "$(DB_URL)" -f server/scripts/verify_multi_org_membership.sql

sqlc:
	sqlc generate -f server/sqlc.yaml

dev-up:
	docker-compose up -d --build

dev-down:
	docker-compose down

analyse-sql:
	cd server && go run ../indexlens.go --schemas ./internal/db/schemas --queries ./internal/db/query

# Use after adding new secrets/env vars to the worker task definition via Terraform.
# Terraform creates a new revision but won't update the service (ignore_changes).
worker-update:
	@REVISION=$$(aws ecs describe-task-definition --task-definition abhiyan-worker --region ap-south-1 --query 'taskDefinition.revision' --output text) && \
	echo "Updating worker service to abhiyan-worker:$$REVISION..." && \
	aws ecs update-service \
		--cluster abhiyan-prod \
		--service abhiyan-worker \
		--task-definition abhiyan-worker:$$REVISION \
		--force-new-deployment \
		--region ap-south-1 \
		--query 'service.serviceArn' \
		--output text > /dev/null && \
	echo "Done. New deployment started."

# Set/overwrite an SSM param directly (bypasses Terraform — for the
# "CHANGE_ME" placeholders that have ignore_changes = [value]).
# usage: make set-ssm var=RESEND_API_KEY value=re_xxx_your_real_key
# usage: make set-ssm var=RESEND_SENDER value=noreply@x.com type=String
set-ssm:
	@test -n "$(var)" || { echo "Usage: make set-ssm var=NAME value=VALUE [type=String|SecureString]"; exit 1; }
	@test -n "$(value)" || { echo "Usage: make set-ssm var=NAME value=VALUE [type=String|SecureString]"; exit 1; }
	aws ssm put-parameter \
		--name "$(SSM_PREFIX)/$(var)" \
		--value "$(value)" \
		--type "$(type)" \
		--overwrite \
		--region ap-south-1
	@echo "Set $(SSM_PREFIX)/$(var)"

worker-dashboard:
	@TASK=$$(aws ecs list-tasks --cluster abhiyan-prod --service-name abhiyan-worker --query 'taskArns[0]' --output text --region ap-south-1) && \
	ENI=$$(aws ecs describe-tasks --cluster abhiyan-prod --tasks $$TASK --region ap-south-1 --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' --output text) && \
	IP=$$(aws ec2 describe-network-interfaces --network-interface-ids $$ENI --region ap-south-1 --query 'NetworkInterfaces[0].Association.PublicIp' --output text) && \
	echo "http://$$IP:8081"

.PHONY: build run migrate-create migrate-up migrate-down migrate-status sqlc dev-up dev-down analyse-sql worker-dashboard worker-update set-ssm unfuck-atlas verify-multi-org