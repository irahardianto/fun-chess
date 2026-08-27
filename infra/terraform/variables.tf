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
  description = "Public URL for Cloud Relay (optional override for join links; leave empty for auto-detection)"
  default     = ""
}

