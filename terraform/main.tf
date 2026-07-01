terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Store state in S3 so the whole team shares it. Create this bucket manually
  # before the first apply (chicken-and-egg — Terraform can't manage the bucket
  # that stores its own state).
  backend "s3" {
    bucket = "abhiyan-terraform-state"
    key    = "prod/terraform.tfstate"
    region = "ap-south-1"
  }
}

provider "aws" {
  region = var.aws_region
}

# API Gateway custom domain certs must live in us-east-1
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

# ── Modules ───────────────────────────────────────────────────────────────────

module "networking" {
  source  = "./modules/networking"
  project = var.project
}

module "data" {
  source = "./modules/data"

  project            = var.project
  private_subnet_ids = module.networking.private_subnet_ids
  rds_sg_id          = module.networking.rds_sg_id
  redis_sg_id        = module.networking.redis_sg_id
  db_password        = var.db_password
  frontend_url       = var.frontend_url
  s3_bucket_name     = var.s3_bucket_name
  aws_ses_sender     = var.aws_ses_sender
  phone_id           = var.phone_id
  cookie_domain      = var.cookie_domain
}

module "compute" {
  source = "./modules/compute"

  project                  = var.project
  aws_region               = var.aws_region
  public_subnet_ids        = module.networking.public_subnet_ids
  private_subnet_ids       = module.networking.private_subnet_ids
  worker_sg_id             = module.networking.worker_sg_id
  lambda_sg_id             = module.networking.lambda_sg_id
  s3_bucket_name           = var.s3_bucket_name
  lambda_deployment_bucket = var.lambda_deployment_bucket
  github_repo              = var.github_repo
  frontend_url             = var.frontend_url

  depends_on = [module.data]
}

module "routing" {
  source = "./modules/routing"

  domain         = var.domain
  api_gateway_id = module.compute.api_gateway_id
}
