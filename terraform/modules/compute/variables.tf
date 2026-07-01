variable "project" {
  type = string
}

variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "worker_sg_id" {
  type = string
}

variable "lambda_sg_id" {
  type = string
}

variable "s3_bucket_name" {
  type = string
}

variable "lambda_deployment_bucket" {
  type = string
}

variable "github_repo" {
  type        = string
  description = "owner/repo format e.g. crizah/Abhiyan"
}

variable "frontend_url" {
  type = string
}
