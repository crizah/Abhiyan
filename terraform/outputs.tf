output "api_url" {
  value = module.routing.api_url
}

output "worker_ecr_url" {
  value = module.compute.worker_ecr_url
}

output "api_gateway_endpoint" {
  description = "Raw API Gateway URL (before custom domain is propagated)"
  value       = module.compute.api_gateway_endpoint
}

output "github_actions_role_arn" {
  description = "Add this ARN to your GitHub Actions workflow as AWS_ROLE_ARN"
  value       = module.compute.github_actions_role_arn
}

output "db_endpoint" {
  value = module.data.db_endpoint
}
