# Note: As of late 2024/early 2025, some Discovery Engine resources 
# may require the 'google-beta' provider or are only available via API/CLI
# for certain complex configurations. This template provides the standard 
# Data Store placeholder logic.

resource "google_discovery_engine_data_store" "factlens_vault" {
  content_config = "CONTENT_REQUIRED"
  data_store_id  = var.data_store_id
  display_name   = "FactLens Knowledge Vault"
  industry_config = "GENERIC"
  location        = "global"
  solution_types  = ["SOLUTION_TYPE_SEARCH"]
}

# Example of a Search Engine linked to the Data Store
resource "google_discovery_engine_search_engine" "factlens_search" {
  data_store_ids = [google_discovery_engine_data_store.factlens_vault.data_store_id]
  display_name   = "FactLens Search Engine"
  engine_id      = "${var.data_store_id}-engine"
  location       = google_discovery_engine_data_store.factlens_vault.location
  
  common_config {
    company_name = "FactLens"
  }
  
  search_engine_config {
    search_add_ons = ["LLM_SEARCH_ADD_ON"]
  }
}
