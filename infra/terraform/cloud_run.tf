# -----------------------------------------------------------------------------
# Google Secret Manager Resources (MAJ-001)
# -----------------------------------------------------------------------------

locals {
  sm_sess_id   = google_secret_manager_secret.session_secret.id
  sm_metr_id   = google_secret_manager_secret.metrics_secret.id
  sm_sess_name = google_secret_manager_secret.session_secret.secret_id
  sm_metr_name = google_secret_manager_secret.metrics_secret.secret_id
}

resource "google_secret_manager_secret" "session_secret" {
  secret_id = "${var.service_name}-session-secret"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "session_secret" {
  secret      = local.sm_sess_id
  secret_data = var.session_secret
}

resource "google_secret_manager_secret" "metrics_secret" {
  secret_id = "${var.service_name}-metrics-secret"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "metrics_secret" {
  secret      = local.sm_metr_id
  secret_data = var.metrics_secret
}

data "google_project" "current" {
  project_id = var.gcp_project_id
}

resource "google_secret_manager_secret_iam_member" "session_secret_accessor" {
  secret_id = google_secret_manager_secret.session_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${data.google_project.current.number}-compute@developer.gserviceaccount.com"
}

resource "google_secret_manager_secret_iam_member" "metrics_secret_accessor" {
  secret_id = google_secret_manager_secret.metrics_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${data.google_project.current.number}-compute@developer.gserviceaccount.com"
}

# -----------------------------------------------------------------------------
# Cloud Run v2 Service
# -----------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "default" {
  name     = var.service_name
  location = var.gcp_region
  ingress  = "INGRESS_TRAFFIC_ALL"

  depends_on = [
    google_secret_manager_secret_version.session_secret,
    google_secret_manager_secret_version.metrics_secret,
    google_secret_manager_secret_iam_member.session_secret_accessor,
    google_secret_manager_secret_iam_member.metrics_secret_accessor,
  ]

  template {
    timeout          = "3600s"
    session_affinity = true

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      image = var.container_image

      resources {
        limits = {
          cpu    = var.cpu_limit
          memory = var.memory_limit
        }
      }

      ports {
        container_port = 3000
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "PUBLIC_URL"
        value = var.public_url
      }

      env {
        name  = "CORS_ORIGIN"
        value = var.cors_origin
      }

      env {
        name  = "TRUST_PROXY"
        value = "true"
      }

      env {
        name = "SESSION_SECRET"
        value_source {
          secret_key_ref {
            secret  = local.sm_sess_name
            version = "latest"
          }
        }
      }

      env {
        name = "METRICS_SECRET"
        value_source {
          secret_key_ref {
            secret  = local.sm_metr_name
            version = "latest"
          }
        }
      }


      startup_probe {
        http_get {
          path = "/healthz"
          port = 3000
        }
        initial_delay_seconds = 0
        period_seconds        = 10
        timeout_seconds       = 3
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/healthz"
          port = 3000
        }
        period_seconds    = 15
        timeout_seconds   = 3
        failure_threshold = 3
      }
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "public_access" {
  location = google_cloud_run_v2_service.default.location
  name     = google_cloud_run_v2_service.default.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
