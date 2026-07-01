output "worker_ecr_url" {
  value = aws_ecr_repository.worker.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "lambda_function_name" {
  value = aws_lambda_function.api.function_name
}

output "api_gateway_id" {
  value = aws_apigatewayv2_api.main.id
}

output "api_gateway_endpoint" {
  value = aws_apigatewayv2_api.main.api_endpoint
}

output "github_actions_role_arn" {
  value = aws_iam_role.github_actions.arn
}

output "lambda_deployment_bucket" {
  value = aws_s3_bucket.lambda_deployments.bucket
}
