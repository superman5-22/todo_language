// Kotlin Ktor — Deploy to Railway / Render / Fly.io
// Build: ./gradlew shadowJar
// Run:   java -jar build/libs/todo-kotlin-all.jar

package com.example.todo

import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.cors.routing.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation as ClientCN
import io.ktor.client.request.*
import io.ktor.client.statement.*
import kotlinx.serialization.json.*

val SUPABASE_URL = System.getenv("SUPABASE_URL") ?: ""
val SUPABASE_KEY = System.getenv("SUPABASE_SERVICE_ROLE_KEY") ?: ""

val httpClient = HttpClient(CIO) {
    install(ClientCN) { json() }
}

fun HttpRequestBuilder.sbHeaders(prefer: String? = null) {
    header("apikey", SUPABASE_KEY)
    header("Authorization", "Bearer $SUPABASE_KEY")
    contentType(ContentType.Application.Json)
    prefer?.let { header("Prefer", it) }
}

fun Application.module() {
    install(ContentNegotiation) { json() }
    install(CORS) {
        anyHost()
        allowMethod(HttpMethod.Get)
        allowMethod(HttpMethod.Post)
        allowMethod(HttpMethod.Patch)
        allowMethod(HttpMethod.Delete)
        allowMethod(HttpMethod.Options)
        allowHeader(HttpHeaders.ContentType)
    }

    routing {
        route("/api/kotlin") {
            get("/todos") {
                val resp = httpClient.get("$SUPABASE_URL/rest/v1/todos?select=*&order=created_at.desc") { sbHeaders() }
                val todos = Json.parseToJsonElement(resp.bodyAsText()).jsonArray
                call.respond(buildJsonObject { put("todos", todos) })
            }

            post("/todos") {
                val body = call.receive<JsonObject>()
                val title = body["title"]?.jsonPrimitive?.contentOrNull?.trim() ?: ""
                if (title.isEmpty()) {
                    call.respond(HttpStatusCode.BadRequest, buildJsonObject { put("error", "title is required") })
                    return@post
                }
                val resp = httpClient.post("$SUPABASE_URL/rest/v1/todos") {
                    sbHeaders("return=representation")
                    setBody(buildJsonObject {
                        put("title", title)
                        put("completed", false)
                    })
                }
                val data = Json.parseToJsonElement(resp.bodyAsText()).jsonArray
                call.respond(HttpStatusCode.Created, buildJsonObject { put("todo", data[0]) })
            }

            patch("/todos/{id}") {
                val id = call.parameters["id"]!!
                val body = call.receive<JsonObject>()
                val update = buildJsonObject {
                    body["title"]?.let { put("title", it) }
                    body["completed"]?.let { put("completed", it) }
                }
                val resp = httpClient.patch("$SUPABASE_URL/rest/v1/todos?id=eq.$id") {
                    sbHeaders("return=representation")
                    setBody(update)
                }
                val data = Json.parseToJsonElement(resp.bodyAsText()).jsonArray
                if (data.isEmpty()) {
                    call.respond(HttpStatusCode.NotFound, buildJsonObject { put("error", "todo not found") })
                    return@patch
                }
                call.respond(buildJsonObject { put("todo", data[0]) })
            }

            delete("/todos/{id}") {
                val id = call.parameters["id"]!!
                val check = httpClient.get("$SUPABASE_URL/rest/v1/todos?id=eq.$id&select=id") { sbHeaders() }
                val existing = Json.parseToJsonElement(check.bodyAsText()).jsonArray
                if (existing.isEmpty()) {
                    call.respond(HttpStatusCode.NotFound, buildJsonObject { put("error", "todo not found") })
                    return@delete
                }
                httpClient.delete("$SUPABASE_URL/rest/v1/todos?id=eq.$id") { sbHeaders() }
                call.respond(buildJsonObject { put("message", "deleted") })
            }
        }
    }
}

fun main() {
    embeddedServer(Netty, port = System.getenv("PORT")?.toInt() ?: 8080, module = Application::module).start(wait = true)
}
