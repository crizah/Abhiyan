DB_URL         ?= postgres://postgres:password@localhost:5432/abhiyan_dev?sslmode=disable
MIGRATIONS_DIR  = server/internal/db/migrations
BUILD_DIR = server/cmd/api
BINARY          = abhiyan

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

worker-dashboard:
	@TASK=$$(aws ecs list-tasks --cluster abhiyan-prod --service-name abhiyan-worker --query 'taskArns[0]' --output text --region ap-south-1) && \
	ENI=$$(aws ecs describe-tasks --cluster abhiyan-prod --tasks $$TASK --region ap-south-1 --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' --output text) && \
	IP=$$(aws ec2 describe-network-interfaces --network-interface-ids $$ENI --region ap-south-1 --query 'NetworkInterfaces[0].Association.PublicIp' --output text) && \
	echo "http://$$IP:8081"

.PHONY: build run migrate-create migrate-up migrate-down migrate-status sqlc dev-up dev-down analyse-sql worker-dashboard worker-update