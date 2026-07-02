# Read SSM params at apply time so Lambda gets them as env vars.
# No SSM SDK call needed at runtime — avoids the need for NAT/VPC endpoints.
data "aws_ssm_parameter" "db_url" {
  name            = "/${var.project}/prod/DB_URL"
  with_decryption = true
}
data "aws_ssm_parameter" "jwt_secret" {
  name            = "/${var.project}/prod/JWT_SECRET"
  with_decryption = true
}
data "aws_ssm_parameter" "broker_url" {
  name            = "/${var.project}/prod/BROKER_URL"
  with_decryption = true
}
data "aws_ssm_parameter" "frontend_url" {
  name            = "/${var.project}/prod/FRONTEND_URL"
  with_decryption = true
}
data "aws_ssm_parameter" "s3_bucket_name" {
  name            = "/${var.project}/prod/AWS_S3_BUCKET_NAME"
  with_decryption = true
}
data "aws_ssm_parameter" "ses_sender" {
  name            = "/${var.project}/prod/AWS_SES_SENDER"
  with_decryption = true
}
data "aws_ssm_parameter" "phone_id" {
  name            = "/${var.project}/prod/PHONE_ID"
  with_decryption = true
}
data "aws_ssm_parameter" "cookie_domain" {
  name            = "/${var.project}/prod/COOKIE_DOMAIN"
  with_decryption = true
}
data "aws_ssm_parameter" "whatsapp_access_token" {
  name            = "/${var.project}/prod/WHATSAPP_ACCESS_TOKEN"
  with_decryption = true
}
data "aws_ssm_parameter" "openai_api_key" {
  name            = "/${var.project}/prod/OPENAI_API_KEY"
  with_decryption = true
}

resource "aws_s3_bucket" "lambda_deployments" {
  bucket = var.lambda_deployment_bucket

  tags = { Name = "${var.project}-lambda-deployments" }
}

# Placeholder zip so Terraform can create the Lambda on first apply.
# CI overwrites api/latest.zip with the real binary after every deploy.
data "archive_file" "lambda_placeholder" {
  type        = "zip"
  output_path = "${path.module}/placeholder-bootstrap.zip"

  source {
    content  = "placeholder"
    filename = "bootstrap"
  }
}

resource "aws_s3_object" "lambda_placeholder" {
  bucket = aws_s3_bucket.lambda_deployments.bucket
  key    = "api/latest.zip"
  source = data.archive_file.lambda_placeholder.output_path

  lifecycle {
    ignore_changes = [source, source_hash, etag]
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${var.project}-api"
  retention_in_days = 14

  tags = { Name = "${var.project}-api-logs" }
}

resource "aws_lambda_function" "api" {
  function_name = "${var.project}-api"
  role          = aws_iam_role.lambda.arn

  s3_bucket = aws_s3_bucket.lambda_deployments.bucket
  s3_key    = "api/latest.zip"

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"

  memory_size = 512
  timeout     = 30

  environment {
    variables = {
      DB_URL                = data.aws_ssm_parameter.db_url.value
      JWT_SECRET            = data.aws_ssm_parameter.jwt_secret.value
      BROKER_URL            = data.aws_ssm_parameter.broker_url.value
      FRONTEND_URL          = data.aws_ssm_parameter.frontend_url.value
      AWS_S3_BUCKET_NAME    = data.aws_ssm_parameter.s3_bucket_name.value
      AWS_SES_SENDER        = data.aws_ssm_parameter.ses_sender.value
      PHONE_ID              = data.aws_ssm_parameter.phone_id.value
      COOKIE_DOMAIN         = data.aws_ssm_parameter.cookie_domain.value
      WHATSAPP_ACCESS_TOKEN = data.aws_ssm_parameter.whatsapp_access_token.value
      OPENAI_API_KEY        = data.aws_ssm_parameter.openai_api_key.value
    }
  }

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [var.lambda_sg_id]
  }

  depends_on = [
    aws_cloudwatch_log_group.api,
    aws_s3_object.lambda_placeholder,
  ]

  lifecycle {
    ignore_changes = [s3_key, s3_object_version]
  }

  tags = { Name = "${var.project}-api" }
}

# ── API Gateway HTTP API ─────────────────────────────────────────────────────

resource "aws_apigatewayv2_api" "main" {
  name          = "${var.project}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = [var.frontend_url]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "proxy" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      responseLength = "$context.responseLength"
    })
  }
}

resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${var.project}"
  retention_in_days = 14
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}
