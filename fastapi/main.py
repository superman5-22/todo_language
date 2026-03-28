"""FastAPI — Vercel Serverless Function"""
import os
import json
import urllib.request
import urllib.error
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)

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


class TodoCreate(BaseModel):
    title: str


class TodoUpdate(BaseModel):
    title: Optional[str] = None
    completed: Optional[bool] = None


@app.get("/api/fastapi/todos")
def get_todos():
    todos = sb_fetch("/todos?select=*&order=created_at.desc")
    return {"todos": todos}


@app.post("/api/fastapi/todos", status_code=201)
def create_todo(payload: TodoCreate):
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="title is required")
    data = sb_fetch(
        "/todos",
        method="POST",
        body={"title": payload.title.strip(), "completed": False},
        extra_headers={"Prefer": "return=representation"},
    )
    return {"todo": data[0]}


@app.patch("/api/fastapi/todos/{todo_id}")
def update_todo(todo_id: str, payload: TodoUpdate):
    update = {}
    if payload.title is not None:
        update["title"] = payload.title
    if payload.completed is not None:
        update["completed"] = payload.completed
    data = sb_fetch(
        f"/todos?id=eq.{todo_id}",
        method="PATCH",
        body=update,
        extra_headers={"Prefer": "return=representation"},
    )
    if not data:
        raise HTTPException(status_code=404, detail="todo not found")
    return {"todo": data[0]}


@app.delete("/api/fastapi/todos/{todo_id}")
def delete_todo(todo_id: str):
    existing = sb_fetch(f"/todos?id=eq.{todo_id}&select=id")
    if not existing:
        raise HTTPException(status_code=404, detail="todo not found")
    sb_fetch(f"/todos?id=eq.{todo_id}", method="DELETE")
    return {"message": "deleted"}
