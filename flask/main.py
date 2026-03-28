"""Flask — Vercel Serverless Function"""
import os
import json
import urllib.request
import urllib.error
from flask import Flask, request, jsonify

app = Flask(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


def sb_fetch(path, method="GET", body=None, extra_headers=None):
    url = f"{SUPABASE_URL}/rest/v1{path}"
    headers = {**SB_HEADERS, **(extra_headers or {})}
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())


@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.route("/api/flask/todos", methods=["OPTIONS"])
@app.route("/api/flask/todos/<todo_id>", methods=["OPTIONS"])
def options(**kwargs):
    return "", 200


@app.route("/api/flask/todos", methods=["GET"])
def get_todos():
    todos = sb_fetch("/todos?select=*&order=created_at.desc")
    return jsonify({"todos": todos})


@app.route("/api/flask/todos", methods=["POST"])
def create_todo():
    body = request.get_json(force=True) or {}
    title = (body.get("title") or "").strip()
    if not title:
        return jsonify({"error": "title is required"}), 400
    data = sb_fetch(
        "/todos",
        method="POST",
        body={"title": title, "completed": False},
        extra_headers={"Prefer": "return=representation"},
    )
    return jsonify({"todo": data[0]}), 201


@app.route("/api/flask/todos/<todo_id>", methods=["PATCH"])
def update_todo(todo_id):
    body = request.get_json(force=True) or {}
    update = {}
    if "title" in body:
        update["title"] = body["title"]
    if "completed" in body:
        update["completed"] = body["completed"]
    data = sb_fetch(
        f"/todos?id=eq.{todo_id}",
        method="PATCH",
        body=update,
        extra_headers={"Prefer": "return=representation"},
    )
    if not data:
        return jsonify({"error": "todo not found"}), 404
    return jsonify({"todo": data[0]})


@app.route("/api/flask/todos/<todo_id>", methods=["DELETE"])
def delete_todo(todo_id):
    existing = sb_fetch(f"/todos?id=eq.{todo_id}&select=id")
    if not existing:
        return jsonify({"error": "todo not found"}), 404
    sb_fetch(f"/todos?id=eq.{todo_id}", method="DELETE")
    return jsonify({"message": "deleted"})
