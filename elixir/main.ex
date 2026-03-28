# Elixir Phoenix — Deploy to Fly.io
# Setup: mix deps.get && mix phx.server
# Build: mix release

defmodule TodoWeb.Router do
  use Phoenix.Router

  pipeline :api do
    plug :accepts, ["json"]
    plug CORSPlug,
      origin: "*",
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
  end

  scope "/api/elixir", TodoWeb do
    pipe_through :api
    get    "/todos",      TodoController, :index
    post   "/todos",      TodoController, :create
    patch  "/todos/:id",  TodoController, :update
    delete "/todos/:id",  TodoController, :delete
  end
end

defmodule TodoWeb.TodoController do
  use Phoenix.Controller, formats: [:json]
  import Plug.Conn

  @supabase_url  System.get_env("SUPABASE_URL", "")
  @supabase_key  System.get_env("SUPABASE_SERVICE_ROLE_KEY", "")

  defp sb_headers(prefer \\ nil) do
    base = [
      {"apikey",        @supabase_key},
      {"Authorization", "Bearer #{@supabase_key}"},
      {"Content-Type",  "application/json"}
    ]
    if prefer, do: [{"Prefer", prefer} | base], else: base
  end

  defp sb_fetch(path, method \\ :get, body \\ nil, prefer \\ nil) do
    url = "#{@supabase_url}/rest/v1#{path}"
    headers = sb_headers(prefer)
    encoded = if body, do: Jason.encode!(body), else: ""

    case :httpc.request(method, {to_charlist(url), Enum.map(headers, fn {k,v} -> {to_charlist(k), to_charlist(v)} end), 'application/json', encoded}, [], []) do
      {:ok, {{_, _status, _}, _hdrs, resp_body}} ->
        case Jason.decode(List.to_string(resp_body)) do
          {:ok, data} -> data
          _ -> []
        end
      _ -> []
    end
  end

  def index(conn, _params) do
    todos = sb_fetch("/todos?select=*&order=created_at.desc")
    json(conn, %{todos: todos})
  end

  def create(conn, _params) do
    body = conn.body_params
    title = String.trim(body["title"] || "")
    if title == "" do
      conn |> put_status(400) |> json(%{error: "title is required"})
    else
      data = sb_fetch("/todos", :post, %{title: title, completed: false}, "return=representation")
      conn |> put_status(201) |> json(%{todo: List.first(data)})
    end
  end

  def update(conn, %{"id" => id}) do
    body = conn.body_params
    update = %{}
    update = if Map.has_key?(body, "title"),     do: Map.put(update, "title",     body["title"]),     else: update
    update = if Map.has_key?(body, "completed"), do: Map.put(update, "completed", body["completed"]), else: update

    data = sb_fetch("/todos?id=eq.#{id}", :patch, update, "return=representation")
    case data do
      [] -> conn |> put_status(404) |> json(%{error: "todo not found"})
      _  -> json(conn, %{todo: List.first(data)})
    end
  end

  def delete(conn, %{"id" => id}) do
    existing = sb_fetch("/todos?id=eq.#{id}&select=id")
    case existing do
      [] -> conn |> put_status(404) |> json(%{error: "todo not found"})
      _  ->
        sb_fetch("/todos?id=eq.#{id}", :delete)
        json(conn, %{message: "deleted"})
    end
  end
end

defmodule TodoWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :todo

  plug Plug.Parsers,
    parsers: [:urlencoded, :multipart, :json],
    pass: ["*/*"],
    json_decoder: Phoenix.json_library()

  plug TodoWeb.Router
end

defmodule Todo.Application do
  use Application

  def start(_type, _args) do
    children = [TodoWeb.Endpoint]
    opts = [strategy: :one_for_one, name: Todo.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
