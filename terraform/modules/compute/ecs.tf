resource "aws_ecs_cluster" "main" {
  name = "${var.project}-prod"

  setting {
    name  = "containerInsights"
    value = "disabled" # enable if you want CloudWatch container metrics ($)
  }

  tags = { Name = "${var.project}-prod" }
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${var.project}/worker"
  retention_in_days = 14

  tags = { Name = "${var.project}-worker-logs" }
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${var.project}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256" # 0.25 vCPU
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "worker"
    image     = "${aws_ecr_repository.worker.repository_url}:latest"
    essential = true

    portMappings = [{
      containerPort = 8081
      protocol      = "tcp"
    }]

    secrets = [
      { name = "DB_URL",                   valueFrom = "/${var.project}/prod/DB_URL" },
      { name = "BROKER_URL",               valueFrom = "/${var.project}/prod/BROKER_URL" },
      { name = "JWT_SECRET",               valueFrom = "/${var.project}/prod/JWT_SECRET" },
      { name = "OPENAI_API_KEY",           valueFrom = "/${var.project}/prod/OPENAI_API_KEY" },
      { name = "DASHBOARD_URL",            valueFrom = "/${var.project}/prod/DASHBOARD_URL" },
      { name = "AWS_S3_BUCKET_NAME",       valueFrom = "/${var.project}/prod/AWS_S3_BUCKET_NAME" },
      { name = "FRONTEND_URL",             valueFrom = "/${var.project}/prod/FRONTEND_URL" },
      { name = "AWS_SES_SENDER",           valueFrom = "/${var.project}/prod/AWS_SES_SENDER" },
      { name = "WHATSAPP_ACCESS_TOKEN",    valueFrom = "/${var.project}/prod/WHATSAPP_ACCESS_TOKEN" },
      { name = "PHONE_ID",                 valueFrom = "/${var.project}/prod/PHONE_ID" },
      { name = "GOOGLE_CLIENT_ID",         valueFrom = "/${var.project}/prod/GOOGLE_CLIENT_ID" },
      { name = "RESEND_API_KEY",           valueFrom = "/${var.project}/prod/RESEND_API_KEY" },
      { name = "RESEND_SENDER",            valueFrom = "/${var.project}/prod/RESEND_SENDER" },
      { name = "FCM_SERVICE_ACCOUNT_JSON", valueFrom = "/${var.project}/prod/FCM_SERVICE_ACCOUNT_JSON" }
    ]

    environment = [
      { name = "AWS_DEFAULT_REGION", value = var.aws_region }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.worker.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "worker"
      }
    }
  }])

  tags = { Name = "${var.project}-worker" }
}

resource "aws_ecs_service" "worker" {
  name            = "${var.project}-worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  # Replace task immediately on new deployment, don't wait for drain
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  network_configuration {
    subnets          = var.public_subnet_ids
    security_groups  = [var.worker_sg_id]
    assign_public_ip = true
  }

  # Ignore task_definition changes from outside Terraform (CI deployments update it)
  lifecycle {
    ignore_changes = [task_definition]
  }

  tags = { Name = "${var.project}-worker" }
}
