// Go Echo — Vercel Serverless Function
package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

var (
	echoApp     *echo.Echo
	supabaseURL = os.Getenv("SUPABASE_URL")
	supabaseKey = os.Getenv("SUPABASE_SERVICE_ROLE_KEY")
)

func init() {
	echoApp = echo.New()
	echoApp.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPatch, http.MethodDelete, http.MethodOptions},
		AllowHeaders: []string{"Content-Type"},
	}))

	api := echoApp.Group("/api/echo")

	api.GET("/todos", func(c echo.Context) error {
		data, err := sbReq("/todos?select=*&order=created_at.desc", "GET", nil, "")
		if err != nil {
			return c.JSON(500, map[string]string{"error": err.Error()})
		}
		var todos []json.RawMessage
		json.Unmarshal(data, &todos)
		return c.JSON(200, map[string]interface{}{"todos": todos})
	})

	api.POST("/todos", func(c echo.Context) error {
		var body map[string]interface{}
		c.Bind(&body)
		title, _ := body["title"].(string)
		if strings.TrimSpace(title) == "" {
			return c.JSON(400, map[string]string{"error": "title is required"})
		}
		data, err := sbReq("/todos", "POST",
			map[string]interface{}{"title": strings.TrimSpace(title), "completed": false},
			"return=representation")
		if err != nil {
			return c.JSON(500, map[string]string{"error": err.Error()})
		}
		var created []json.RawMessage
		json.Unmarshal(data, &created)
		return c.JSON(201, map[string]interface{}{"todo": created[0]})
	})

	api.PATCH("/todos/:id", func(c echo.Context) error {
		id := c.Param("id")
		var body map[string]interface{}
		c.Bind(&body)
		update := map[string]interface{}{}
		if v, ok := body["title"]; ok {
			update["title"] = v
		}
		if v, ok := body["completed"]; ok {
			update["completed"] = v
		}
		data, err := sbReq(fmt.Sprintf("/todos?id=eq.%s", id), "PATCH",
			update, "return=representation")
		if err != nil {
			return c.JSON(500, map[string]string{"error": err.Error()})
		}
		var updated []json.RawMessage
		json.Unmarshal(data, &updated)
		if len(updated) == 0 {
			return c.JSON(404, map[string]string{"error": "todo not found"})
		}
		return c.JSON(200, map[string]interface{}{"todo": updated[0]})
	})

	api.DELETE("/todos/:id", func(c echo.Context) error {
		id := c.Param("id")
		check, err := sbReq(fmt.Sprintf("/todos?id=eq.%s&select=id", id), "GET", nil, "")
		if err != nil {
			return c.JSON(500, map[string]string{"error": err.Error()})
		}
		var existing []json.RawMessage
		json.Unmarshal(check, &existing)
		if len(existing) == 0 {
			return c.JSON(404, map[string]string{"error": "todo not found"})
		}
		sbReq(fmt.Sprintf("/todos?id=eq.%s", id), "DELETE", nil, "")
		return c.JSON(200, map[string]string{"message": "deleted"})
	})
}

func sbReq(path, method string, body interface{}, prefer string) ([]byte, error) {
	var reader io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		reader = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, supabaseURL+"/rest/v1"+path, reader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", supabaseKey)
	req.Header.Set("Authorization", "Bearer "+supabaseKey)
	req.Header.Set("Content-Type", "application/json")
	if prefer != "" {
		req.Header.Set("Prefer", prefer)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

// Handler is the Vercel entry point
func Handler(w http.ResponseWriter, r *http.Request) {
	echoApp.ServeHTTP(w, r)
}
