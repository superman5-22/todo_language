// Rust Actix-web — Deploy to Fly.io / Railway
// Build: cargo build --release
// Run:   ./target/release/todo-rust

use actix_cors::Cors;
use actix_web::{
    delete, get, patch, post,
    web::{Data, Json, Path},
    App, HttpResponse, HttpServer, Responder,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;

#[derive(Clone)]
struct AppState {
    client:        Client,
    supabase_url:  String,
    supabase_key:  String,
}

impl AppState {
    fn sb_url(&self, path: &str) -> String {
        format!("{}/rest/v1{}", self.supabase_url, path)
    }

    fn sb_headers(&self) -> reqwest::header::HeaderMap {
        let mut h = reqwest::header::HeaderMap::new();
        h.insert("apikey", self.supabase_key.parse().unwrap());
        h.insert("Authorization", format!("Bearer {}", self.supabase_key).parse().unwrap());
        h.insert("Content-Type", "application/json".parse().unwrap());
        h
    }
}

#[derive(Deserialize)]
struct CreateBody {
    title: Option<String>,
}

#[derive(Deserialize)]
struct UpdateBody {
    title:     Option<String>,
    completed: Option<bool>,
}

#[get("/api/rust/todos")]
async fn get_todos(state: Data<AppState>) -> impl Responder {
    let resp = state.client
        .get(state.sb_url("/todos?select=*&order=created_at.desc"))
        .headers(state.sb_headers())
        .send().await;

    match resp {
        Ok(r) => {
            let todos: Value = r.json().await.unwrap_or(json!([]));
            HttpResponse::Ok().json(json!({ "todos": todos }))
        }
        Err(e) => HttpResponse::InternalServerError().json(json!({ "error": e.to_string() })),
    }
}

#[post("/api/rust/todos")]
async fn create_todo(state: Data<AppState>, body: Json<CreateBody>) -> impl Responder {
    let title = body.title.as_deref().unwrap_or("").trim().to_string();
    if title.is_empty() {
        return HttpResponse::BadRequest().json(json!({ "error": "title is required" }));
    }
    let resp = state.client
        .post(state.sb_url("/todos"))
        .headers(state.sb_headers())
        .header("Prefer", "return=representation")
        .json(&json!({ "title": title, "completed": false }))
        .send().await;

    match resp {
        Ok(r) => {
            let data: Value = r.json().await.unwrap_or(json!([]));
            HttpResponse::Created().json(json!({ "todo": data[0] }))
        }
        Err(e) => HttpResponse::InternalServerError().json(json!({ "error": e.to_string() })),
    }
}

#[patch("/api/rust/todos/{id}")]
async fn update_todo(state: Data<AppState>, id: Path<String>, body: Json<UpdateBody>) -> impl Responder {
    let mut update = serde_json::Map::new();
    if let Some(t) = &body.title     { update.insert("title".into(), json!(t)); }
    if let Some(c) = body.completed  { update.insert("completed".into(), json!(c)); }

    let resp = state.client
        .patch(state.sb_url(&format!("/todos?id=eq.{}", id)))
        .headers(state.sb_headers())
        .header("Prefer", "return=representation")
        .json(&update)
        .send().await;

    match resp {
        Ok(r) => {
            let data: Value = r.json().await.unwrap_or(json!([]));
            if data.as_array().map(|a| a.is_empty()).unwrap_or(true) {
                return HttpResponse::NotFound().json(json!({ "error": "todo not found" }));
            }
            HttpResponse::Ok().json(json!({ "todo": data[0] }))
        }
        Err(e) => HttpResponse::InternalServerError().json(json!({ "error": e.to_string() })),
    }
}

#[delete("/api/rust/todos/{id}")]
async fn delete_todo(state: Data<AppState>, id: Path<String>) -> impl Responder {
    let check = state.client
        .get(state.sb_url(&format!("/todos?id=eq.{}&select=id", id)))
        .headers(state.sb_headers())
        .send().await;

    match check {
        Ok(r) => {
            let existing: Value = r.json().await.unwrap_or(json!([]));
            if existing.as_array().map(|a| a.is_empty()).unwrap_or(true) {
                return HttpResponse::NotFound().json(json!({ "error": "todo not found" }));
            }
        }
        Err(e) => return HttpResponse::InternalServerError().json(json!({ "error": e.to_string() })),
    }

    let _ = state.client
        .delete(state.sb_url(&format!("/todos?id=eq.{}", id)))
        .headers(state.sb_headers())
        .send().await;

    HttpResponse::Ok().json(json!({ "message": "deleted" }))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let port: u16 = env::var("PORT").unwrap_or_else(|_| "8080".to_string()).parse().unwrap_or(8080);
    let state = Data::new(AppState {
        client:       Client::new(),
        supabase_url: env::var("SUPABASE_URL").unwrap_or_default(),
        supabase_key: env::var("SUPABASE_SERVICE_ROLE_KEY").unwrap_or_default(),
    });

    HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .wrap(Cors::permissive())
            .service(get_todos)
            .service(create_todo)
            .service(update_todo)
            .service(delete_todo)
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
