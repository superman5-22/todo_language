"""Django REST Framework — Vercel Serverless Function"""
import os
import sys
import json
import urllib.request
import urllib.error

# Minimal Django setup without a full project structure
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "__main__")

# Inline Django settings
import django
from django.conf import settings

if not settings.configured:
    settings.configure(
        DEBUG=False,
        ALLOWED_HOSTS=["*"],
        INSTALLED_APPS=[
            "django.contrib.contenttypes",
            "django.contrib.auth",
            "rest_framework",
        ],
        DATABASES={},
        ROOT_URLCONF=__name__,
        REST_FRAMEWORK={
            "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
        },
    )
    django.setup()

from django.http import JsonResponse
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from django.urls import path

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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


def cors_json(data, status=200):
    r = JsonResponse(data, status=status)
    for k, v in CORS.items():
        r[k] = v
    return r


@csrf_exempt
def todos_view(request):
    if request.method == "OPTIONS":
        return cors_json({})

    if request.method == "GET":
        todos = sb_fetch("/todos?select=*&order=created_at.desc")
        return cors_json({"todos": todos})

    if request.method == "POST":
        try:
            body = json.loads(request.body)
        except Exception:
            body = {}
        title = (body.get("title") or "").strip()
        if not title:
            return cors_json({"error": "title is required"}, 400)
        data = sb_fetch(
            "/todos",
            method="POST",
            body={"title": title, "completed": False},
            extra_headers={"Prefer": "return=representation"},
        )
        return cors_json({"todo": data[0]}, 201)

    return cors_json({"error": "method not allowed"}, 405)


@csrf_exempt
def todo_detail_view(request, todo_id):
    if request.method == "OPTIONS":
        return cors_json({})

    if request.method == "PATCH":
        try:
            body = json.loads(request.body)
        except Exception:
            body = {}
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
            return cors_json({"error": "todo not found"}, 404)
        return cors_json({"todo": data[0]})

    if request.method == "DELETE":
        existing = sb_fetch(f"/todos?id=eq.{todo_id}&select=id")
        if not existing:
            return cors_json({"error": "todo not found"}, 404)
        sb_fetch(f"/todos?id=eq.{todo_id}", method="DELETE")
        return cors_json({"message": "deleted"})

    return cors_json({"error": "method not allowed"}, 405)


urlpatterns = [
    path("api/django/todos", todos_view),
    path("api/django/todos/<str:todo_id>", todo_detail_view),
]

# Vercel WSGI entry point
from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()
app = application
