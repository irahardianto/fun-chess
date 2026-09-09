variable "gcp_project_id" {
  type        = string
  description = "Google Cloud Project ID"
}

variable "gcp_region" {
  type        = string
  description = "GCP Region for Cloud Run"
  default     = "asia-southeast1"
}

variable "service_name" {
  type        = string
  description = "Cloud Run service name"
  default     = "fun-chess"
}

variable "container_image" {
  type        = string
  description = "Container image URI (e.g. gcr.io/PROJECT_ID/fun-chess:latest or LOCATION-docker.pkg.dev/PROJECT_ID/REPO/fun-chess:latest)"
}

variable "min_instances" {
  type        = number
  description = "Minimum number of Cloud Run instances (0 for scale-to-zero)"
  default     = 0
}

variable "max_instances" {
  type        = number
  description = "Maximum number of Cloud Run instances (set to 1 for zero-database in-memory room store to prevent room splitting across instances)"
  default     = 1
}

variable "cpu_limit" {
  type        = string
  description = "CPU limit for container"
  default     = "1"
}

variable "memory_limit" {
  type        = string
  description = "Memory limit for container"
  default     = "512Mi"
}

variable "public_url" {
  type        = string
  description = "Public URL for Cloud Relay (e.g. https://fun-chess.example.com). Either public_url or cors_origin must be specified to prevent container crash."
  default     = ""

  validation {
    condition     = var.public_url == "" || can(regex("^https?://", var.public_url))
    error_message = "public_url must be empty or a valid HTTP/HTTPS URL starting with http:// or https://"
  }

  validation {
    condition     = length(trimspace(var.public_url)) > 0 || length(trimspace(var.cors_origin)) > 0
    error_message = "At least one of public_url or cors_origin must be specified and non-empty."
  }
}

variable "cors_origin" {
  type        = string
  description = "Allowed CORS origins for Cloud Run (comma-separated list of origins, e.g. https://fun-chess.example.com). Either public_url or cors_origin must be specified to prevent container crash."
  default     = ""

  validation {
    condition     = var.cors_origin == "" || can(regex("^https?://[^,]+(,\\s*https?://[^,]+)*$", var.cors_origin))
    error_message = "cors_origin must be empty or a comma-separated list of valid HTTP/HTTPS origins (wildcard '*' is disallowed in production)."
  }
}


