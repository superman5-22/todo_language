// Go net/http stdlib — Vercel Serverless Function
package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strings"
)

var (
	supabaseURL = os.Getenv("SUPABASE_URL")
	supabaseKey = os.Getenv("SUPABASE_SERVICE_ROLE_KEY")
	idPattern   = regexp.MustCompile(`^/todos/([^/]+)$`)
)

func sbHeaders(req *http.Request) {
	req.Header.Set("apikey", supabaseKey)
	req.Header.Set("Authorization", "Bearer "+supabaseKey)
	req.Header.Set("Content-Type", "application/json")
}

func sbFetch(path, method string, body interface{}, prefer string) ([]byte, int, error) {
	var bodyReader io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		bodyReader = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, supabaseURL+"/rest/v1"+path, bodyReader)
	if err != nil {
		return nil, 0, err
	}
	sbHeaders(req)
	if prefer != "" {
		req.Header.Set("Prefer", prefer)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return data, resp.StatusCode, nil
}

func setCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	setCORS(w)
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// Handler is the Vercel entry point
func Handler(w http.ResponseWriter, r *http.Request) {
	setCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Strip /api/go prefix
	path := strings.TrimPrefix(r.URL.Path, "/api/go")
	matches := idPattern.FindStringSubmatch(path)

	switch {
	case r.Method == http.MethodGet && path == "/todos":
		data, _, err := sbFetch("/todos?select=*&order=created_at.desc", "GET", nil, "")
		if err != nil {
			writeJSON(w, 500, map[string]string{"error": err.Error()})
			return
		}
		var todos []json.RawMessage
		json.Unmarshal(data, &todos)
		writeJSON(w, 200, map[string]interface{}{"todos": todos})

	case r.Method == http.MethodPost && path == "/todos":
		var body map[string]interface{}
		json.NewDecoder(r.Body).Decode(&body)
		title, _ := body["title"].(string)
		if strings.TrimSpace(title) == "" {
			writeJSON(w, 400, map[string]string{"error": "title is required"})
			return
		}
		data, _, err := sbFetch("/todos", "POST",
			map[string]interface{}{"title": strings.TrimSpace(title), "completed": false},
			"return=representation")
		if err != nil {
			writeJSON(w, 500, map[string]string{"error": err.Error()})
			return
		}
		var created []json.RawMessage
		json.Unmarshal(data, &created)
		writeJSON(w, 201, map[string]interface{}{"todo": created[0]})

	case r.Method == http.MethodPatch && matches != nil:
		id := matches[1]
		var body map[string]interface{}
		json.NewDecoder(r.Body).Decode(&body)
		update := map[string]interface{}{}
		if v, ok := body["title"]; ok {
			update["title"] = v
		}
		if v, ok := body["completed"]; ok {
			update["completed"] = v
		}
		data, _, err := sbFetch(fmt.Sprintf("/todos?id=eq.%s", id), "PATCH",
			update, "return=representation")
		if err != nil {
			writeJSON(w, 500, map[string]string{"error": err.Error()})
			return
		}
		var updated []json.RawMessage
		json.Unmarshal(data, &updated)
		if len(updated) == 0 {
			writeJSON(w, 404, map[string]string{"error": "todo not found"})
			return
		}
		writeJSON(w, 200, map[string]interface{}{"todo": updated[0]})

	case r.Method == http.MethodDelete && matches != nil:
		id := matches[1]
		check, _, err := sbFetch(fmt.Sprintf("/todos?id=eq.%s&select=id", id), "GET", nil, "")
		if err != nil {
			writeJSON(w, 500, map[string]string{"error": err.Error()})
			return
		}
		var existing []json.RawMessage
		json.Unmarshal(check, &existing)
		if len(existing) == 0 {
			writeJSON(w, 404, map[string]string{"error": "todo not found"})
			return
		}
		sbFetch(fmt.Sprintf("/todos?id=eq.%s", id), "DELETE", nil, "")
		writeJSON(w, 200, map[string]string{"message": "deleted"})

	default:
		writeJSON(w, 404, map[string]string{"error": "not found"})
	}
}
