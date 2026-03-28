# Ruby on Rails API (minimal inline) — Vercel Serverless Function
require 'json'
require 'net/http'
require 'uri'

SUPABASE_URL = ENV['SUPABASE_URL']
SUPABASE_KEY = ENV['SUPABASE_SERVICE_ROLE_KEY']

CORS_HEADERS = {
  'Access-Control-Allow-Origin'  => '*',
  'Access-Control-Allow-Methods' => 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers' => 'Content-Type',
  'Content-Type'                 => 'application/json'
}.freeze

def sb_fetch(path, method: 'GET', body: nil, prefer: nil)
  uri = URI("#{SUPABASE_URL}/rest/v1#{path}")
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true

  klass = { 'GET' => Net::HTTP::Get, 'POST' => Net::HTTP::Post,
            'PATCH' => Net::HTTP::Patch, 'DELETE' => Net::HTTP::Delete }[method]
  req = klass.new(uri.request_uri)
  req['apikey']        = SUPABASE_KEY
  req['Authorization'] = "Bearer #{SUPABASE_KEY}"
  req['Content-Type']  = 'application/json'
  req['Prefer']        = prefer if prefer
  req.body = body.to_json if body

  resp = http.request(req)
  resp.body.empty? ? [] : JSON.parse(resp.body)
end

def json_response(status, data)
  [status, CORS_HEADERS, [data.to_json]]
end

APP = lambda do |env|
  req    = Rack::Request.new(env)
  method = req.request_method
  path   = req.path.sub(%r{^/api/rails}, '')

  return [200, CORS_HEADERS, ['']] if method == 'OPTIONS'

  begin
    case [method, path]
    in ['GET', '/todos']
      todos = sb_fetch('/todos?select=*&order=created_at.desc')
      json_response(200, { todos: todos })

    in ['POST', '/todos']
      body  = JSON.parse(req.body.read) rescue {}
      title = (body['title'] || '').strip
      return json_response(400, { error: 'title is required' }) if title.empty?

      data = sb_fetch('/todos', method: 'POST',
                      body: { title: title, completed: false },
                      prefer: 'return=representation')
      json_response(201, { todo: data[0] })

    in [/PATCH/, /^\/todos\/(.+)$/]
      id   = path.split('/').last
      body = JSON.parse(req.body.read) rescue {}
      update = {}
      update['title']     = body['title']     if body.key?('title')
      update['completed'] = body['completed'] if body.key?('completed')

      data = sb_fetch("/todos?id=eq.#{id}", method: 'PATCH',
                      body: update, prefer: 'return=representation')
      return json_response(404, { error: 'todo not found' }) if data.empty?
      json_response(200, { todo: data[0] })

    in ['DELETE', /^\/todos\/(.+)$/]
      id       = path.split('/').last
      existing = sb_fetch("/todos?id=eq.#{id}&select=id")
      return json_response(404, { error: 'todo not found' }) if existing.empty?

      sb_fetch("/todos?id=eq.#{id}", method: 'DELETE')
      json_response(200, { message: 'deleted' })

    else
      json_response(404, { error: 'not found' })
    end
  rescue => e
    json_response(500, { error: e.message })
  end
end

run APP
