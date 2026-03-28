// C# ASP.NET Core Minimal API — Deploy to Azure App Service / Railway
// Build: dotnet publish -c Release
// Run:   dotnet run

using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHttpClient();
builder.Services.AddCors(opts =>
    opts.AddDefaultPolicy(p => p
        .AllowAnyOrigin()
        .WithMethods("GET", "POST", "PATCH", "DELETE", "OPTIONS")
        .AllowAnyHeader()));

var app = builder.Build();
app.UseCors();

var supabaseUrl = Environment.GetEnvironmentVariable("SUPABASE_URL") ?? "";
var supabaseKey = Environment.GetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY") ?? "";

HttpRequestMessage SbRequest(string path, HttpMethod method, object? body = null, bool prefer = false)
{
    var req = new HttpRequestMessage(method, $"{supabaseUrl}/rest/v1{path}");
    req.Headers.Add("apikey", supabaseKey);
    req.Headers.Add("Authorization", $"Bearer {supabaseKey}");
    if (prefer) req.Headers.Add("Prefer", "return=representation");
    if (body != null)
        req.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
    return req;
}

async Task<JsonNode?> SbFetch(HttpClient client, string path, HttpMethod method, object? body = null, bool prefer = false)
{
    var req = SbRequest(path, method, body, prefer);
    var resp = await client.SendAsync(req);
    var text = await resp.Content.ReadAsStringAsync();
    return string.IsNullOrWhiteSpace(text) ? null : JsonNode.Parse(text);
}

// GET /api/csharp/todos
app.MapGet("/api/csharp/todos", async (IHttpClientFactory factory) =>
{
    var client = factory.CreateClient();
    var data = await SbFetch(client, "/todos?select=*&order=created_at.desc", HttpMethod.Get);
    return Results.Ok(new { todos = data });
});

// POST /api/csharp/todos
app.MapPost("/api/csharp/todos", async (IHttpClientFactory factory, JsonNode body) =>
{
    var title = body["title"]?.GetValue<string>()?.Trim() ?? "";
    if (string.IsNullOrEmpty(title))
        return Results.BadRequest(new { error = "title is required" });

    var client = factory.CreateClient();
    var data = await SbFetch(client, "/todos", HttpMethod.Post,
        new { title, completed = false }, prefer: true) as JsonArray;
    return Results.Created("/api/csharp/todos", new { todo = data?[0] });
});

// PATCH /api/csharp/todos/{id}
app.MapMethods("/api/csharp/todos/{id}", ["PATCH"], async (IHttpClientFactory factory, string id, JsonNode body) =>
{
    var update = new Dictionary<string, object?>();
    if (body["title"] != null)     update["title"]     = body["title"]!.GetValue<string>();
    if (body["completed"] != null) update["completed"] = body["completed"]!.GetValue<bool>();

    var client = factory.CreateClient();
    var data = await SbFetch(client, $"/todos?id=eq.{id}", HttpMethod.Patch, update, prefer: true) as JsonArray;
    if (data == null || data.Count == 0)
        return Results.NotFound(new { error = "todo not found" });
    return Results.Ok(new { todo = data[0] });
});

// DELETE /api/csharp/todos/{id}
app.MapDelete("/api/csharp/todos/{id}", async (IHttpClientFactory factory, string id) =>
{
    var client = factory.CreateClient();
    var existing = await SbFetch(client, $"/todos?id=eq.{id}&select=id", HttpMethod.Get) as JsonArray;
    if (existing == null || existing.Count == 0)
        return Results.NotFound(new { error = "todo not found" });

    await SbFetch(client, $"/todos?id=eq.{id}", HttpMethod.Delete);
    return Results.Ok(new { message = "deleted" });
});

app.Run();
