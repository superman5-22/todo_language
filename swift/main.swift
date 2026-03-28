// Swift Vapor — Deploy to Fly.io / Railway
// Build: swift build -c release
// Run:   .build/release/todo-swift

import Vapor
import Foundation

func configureRoutes(_ app: Application) throws {
    let supabaseURL = Environment.get("SUPABASE_URL") ?? ""
    let supabaseKey = Environment.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

    func sbHeaders(prefer: String? = nil) -> HTTPHeaders {
        var h = HTTPHeaders()
        h.add(name: "apikey",        value: supabaseKey)
        h.add(name: "Authorization", value: "Bearer \(supabaseKey)")
        h.add(name: "Content-Type",  value: "application/json")
        if let p = prefer { h.add(name: "Prefer", value: p) }
        return h
    }

    func sbFetch(_ path: String, method: HTTPMethod = .GET, body: String? = nil, prefer: String? = nil) async throws -> ClientResponse {
        let url = URI(string: "\(supabaseURL)/rest/v1\(path)")
        return try await app.client.send(method, headers: sbHeaders(prefer: prefer), to: url) { req in
            if let b = body { req.body = .init(string: b) }
        }
    }

    let corsConfig = CORSMiddleware.Configuration(
        allowedOrigin: .all,
        allowedMethods: [.GET, .POST, .PATCH, .DELETE, .OPTIONS],
        allowedHeaders: [.contentType]
    )
    let cors = CORSMiddleware(configuration: corsConfig)
    app.middleware.use(cors)

    let api = app.grouped("api", "swift")

    // GET /todos
    api.get("todos") { req async throws -> Response in
        let r = try await sbFetch("/todos?select=*&order=created_at.desc")
        let todos = try JSONSerialization.jsonObject(with: Data(buffer: r.body ?? ByteBuffer()))
        let out = try JSONSerialization.data(withJSONObject: ["todos": todos])
        return Response(status: .ok, headers: ["Content-Type": "application/json"], body: .init(data: out))
    }

    // POST /todos
    api.post("todos") { req async throws -> Response in
        guard let body = req.body.data,
              let json = try? JSONSerialization.jsonObject(with: Data(buffer: body)) as? [String: Any],
              let title = (json["title"] as? String)?.trimmingCharacters(in: .whitespaces),
              !title.isEmpty else {
            let err = try JSONSerialization.data(withJSONObject: ["error": "title is required"])
            return Response(status: .badRequest, headers: ["Content-Type": "application/json"], body: .init(data: err))
        }
        let payload = try JSONSerialization.data(withJSONObject: ["title": title, "completed": false])
        let r = try await sbFetch("/todos", method: .POST, body: String(data: payload, encoding: .utf8), prefer: "return=representation")
        let data = try JSONSerialization.jsonObject(with: Data(buffer: r.body ?? ByteBuffer())) as? [[String: Any]]
        let out = try JSONSerialization.data(withJSONObject: ["todo": data?.first ?? [:]])
        return Response(status: .created, headers: ["Content-Type": "application/json"], body: .init(data: out))
    }

    // PATCH /todos/:id
    api.patch("todos", ":id") { req async throws -> Response in
        let id = req.parameters.get("id")!
        var update: [String: Any] = [:]
        if let body = req.body.data,
           let json = try? JSONSerialization.jsonObject(with: Data(buffer: body)) as? [String: Any] {
            if let t = json["title"]     { update["title"]     = t }
            if let c = json["completed"] { update["completed"] = c }
        }
        let payload = try JSONSerialization.data(withJSONObject: update)
        let r = try await sbFetch("/todos?id=eq.\(id)", method: .PATCH, body: String(data: payload, encoding: .utf8), prefer: "return=representation")
        let data = try JSONSerialization.jsonObject(with: Data(buffer: r.body ?? ByteBuffer())) as? [[String: Any]]
        guard let first = data?.first else {
            let err = try JSONSerialization.data(withJSONObject: ["error": "todo not found"])
            return Response(status: .notFound, headers: ["Content-Type": "application/json"], body: .init(data: err))
        }
        let out = try JSONSerialization.data(withJSONObject: ["todo": first])
        return Response(status: .ok, headers: ["Content-Type": "application/json"], body: .init(data: out))
    }

    // DELETE /todos/:id
    api.delete("todos", ":id") { req async throws -> Response in
        let id = req.parameters.get("id")!
        let check = try await sbFetch("/todos?id=eq.\(id)&select=id")
        let existing = try JSONSerialization.jsonObject(with: Data(buffer: check.body ?? ByteBuffer())) as? [[String: Any]]
        guard let existing, !existing.isEmpty else {
            let err = try JSONSerialization.data(withJSONObject: ["error": "todo not found"])
            return Response(status: .notFound, headers: ["Content-Type": "application/json"], body: .init(data: err))
        }
        _ = try await sbFetch("/todos?id=eq.\(id)", method: .DELETE)
        let out = try JSONSerialization.data(withJSONObject: ["message": "deleted"])
        return Response(status: .ok, headers: ["Content-Type": "application/json"], body: .init(data: out))
    }
}

@main
struct TodoApp {
    static func main() async throws {
        var env = try Environment.detect()
        try LoggingSystem.bootstrap(from: &env)
        let app = Application(env)
        defer { app.shutdown() }
        try configureRoutes(app)
        let port = Int(Environment.get("PORT") ?? "8080") ?? 8080
        app.http.server.configuration.port = port
        try app.run()
    }
}
