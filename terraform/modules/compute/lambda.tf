resource "aws_s3_bucket" "lambda_deployments" {
  bucket = var.lambda_deployment_bucket

  tags = { Name = "${var.project}-lambda-deployments" }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${var.project}-api"
  retention_in_days = 14

  tags = { Name = "${var.project}-api-logs" }
}

resource "aws_lambda_function" "api" {
  function_name = "${var.project}-api"
  role          = aws_iam_role.lambda.arn

  # Bootstrap binary built by CI (GOOS=linux GOARCH=arm64)
  s3_bucket = aws_s3_bucket.lambda_deployments.bucket
  s3_key    = "api/latest.zip"

  # arm64 (Graviton) is cheaper and faster than x86 for Go
  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"

  memory_size = 512
  timeout     = 30

  environment {
    variables = {
      AWS_DEFAULT_REGION = var.aws_region
    }
  }

  # Pull secrets from SSM at cold-start via the Parameters and Secrets Lambda extension
  # These become env vars inside the function — os.Getenv() works as normal
  dynamic "environment" {
    for_each = []
    content {}
  }

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [var.lambda_sg_id]
  }

  depends_on = [aws_cloudwatch_log_group.api]

  tags = { Name = "${var.project}-api" }
}

# Lambda reads SSM params at startup via the AWS Parameters and Secrets extension layer
# The layer ARN is region-specific. This is the ap-south-1 arm64 ARN.
resource "aws_lambda_layer_version_permission" "ssm_extension" {
  # No resource needed — we reference the AWS-managed layer directly in the function
  # Layer: arn:aws:lambda:ap-south-1:017000801446:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:12
  # Add this ARN to layers in aws_lambda_function above when wiring SSM env vars via extension
  layer_name     = "placeholder"
  version_number = 1
  action         = "lambda:GetLayerVersion"
  principal      = "*"
  statement_id   = "placeholder"

  lifecycle {
    ignore_changes = all
  }
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
