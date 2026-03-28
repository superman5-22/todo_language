# Ruby Sinatra — Vercel Serverless Function
require 'sinatra/base'
require 'json'
require 'net/http'
require 'uri'

SUPABASE_URL = ENV['SUPABASE_URL']
SUPABASE_KEY = ENV['SUPABASE_SERVICE_ROLE_KEY']

def sb_fetch(path, method: 'GET', body: nil, prefer: nil)
  uri  = URI("#{SUPABASE_URL}/rest/v1#{path}")
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

class TodoApp < Sinatra::Base
  before do
    response.headers['Access-Control-Allow-Origin']  = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    content_type :json
  end

  options '/api/sinatra/todos'       { 200 }
  options '/api/sinatra/todos/:id'   { 200 }

  get '/api/sinatra/todos' do
    todos = sb_fetch('/todos?select=*&order=created_at.desc')
    { todos: todos }.to_json
  end

  post '/api/sinatra/todos' do
    body  = JSON.parse(request.body.read) rescue {}
    title = (body['title'] || '').strip
    halt 400, { error: 'title is required' }.to_json if title.empty?

    data = sb_fetch('/todos', method: 'POST',
                    body: { title: title, completed: false },
                    prefer: 'return=representation')
    status 201
    { todo: data[0] }.to_json
  end

  patch '/api/sinatra/todos/:id' do
    id   = params[:id]
    body = JSON.parse(request.body.read) rescue {}
    update = {}
    update['title']     = body['title']     if body.key?('title')
    update['completed'] = body['completed'] if body.key?('completed')

    data = sb_fetch("/todos?id=eq.#{id}", method: 'PATCH',
                    body: update, prefer: 'return=representation')
    halt 404, { error: 'todo not found' }.to_json if data.empty?
    { todo: data[0] }.to_json
  end

  delete '/api/sinatra/todos/:id' do
    id       = params[:id]
    existing = sb_fetch("/todos?id=eq.#{id}&select=id")
    halt 404, { error: 'todo not found' }.to_json if existing.empty?

    sb_fetch("/todos?id=eq.#{id}", method: 'DELETE')
    { message: 'deleted' }.to_json
  end
end

run TodoApp
