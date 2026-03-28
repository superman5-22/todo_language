// Go Fiber — Vercel Serverless Function
// Note: Fiber wraps fasthttp which is not compatible with net/http directly.
// For Vercel we use a net/http adapter via adaptor package.
package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/valyala/fasthttp/fasthttpadaptor"
)

var (
	fiberApp    *fiber.App
	supabaseURL = os.Getenv("SUPABASE_URL")
	supabaseKey = os.Getenv("SUPABASE_SERVICE_ROLE_KEY")
)

func init() {
	fiberApp = fiber.New()
	fiberApp.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowMethods: "GET,POST,PATCH,DELETE,OPTIONS",
		AllowHeaders: "Content-Type",
	}))

	api := fiberApp.Group("/api/fiber")

	api.Get("/todos", func(c *fiber.Ctx) error {
		data, err := sbCall("/todos?select=*&order=created_at.desc", "GET", nil, "")
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		var todos []json.RawMessage
		json.Unmarshal(data, &todos)
		return c.JSON(fiber.Map{"todos": todos})
	})

	api.Post("/todos", func(c *fiber.Ctx) error {
		var body map[string]interface{}
		c.BodyParser(&body)
		title, _ := body["title"].(string)
		if strings.TrimSpace(title) == "" {
			return c.Status(400).JSON(fiber.Map{"error": "title is required"})
		}
		data, err := sbCall("/todos", "POST",
			map[string]interface{}{"title": strings.TrimSpace(title), "completed": false},
			"return=representation")
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		var created []json.RawMessage
		json.Unmarshal(data, &created)
		return c.Status(201).JSON(fiber.Map{"todo": created[0]})
	})

	api.Patch("/todos/:id", func(c *fiber.Ctx) error {
		id := c.Params("id")
		var body map[string]interface{}
		c.BodyParser(&body)
		update := map[string]interface{}{}
		if v, ok := body["title"]; ok {
			update["title"] = v
		}
		if v, ok := body["completed"]; ok {
			update["completed"] = v
		}
		data, err := sbCall(fmt.Sprintf("/todos?id=eq.%s", id), "PATCH",
			update, "return=representation")
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		var updated []json.RawMessage
		json.Unmarshal(data, &updated)
		if len(updated) == 0 {
			return c.Status(404).JSON(fiber.Map{"error": "todo not found"})
		}
		return c.JSON(fiber.Map{"todo": updated[0]})
	})

	api.Delete("/todos/:id", func(c *fiber.Ctx) error {
		id := c.Params("id")
		check, err := sbCall(fmt.Sprintf("/todos?id=eq.%s&select=id", id), "GET", nil, "")
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		var existing []json.RawMessage
		json.Unmarshal(check, &existing)
		if len(existing) == 0 {
			return c.Status(404).JSON(fiber.Map{"error": "todo not found"})
		}
		sbCall(fmt.Sprintf("/todos?id=eq.%s", id), "DELETE", nil, "")
		return c.JSON(fiber.Map{"message": "deleted"})
	})
}

func sbCall(path, method string, body interface{}, prefer string) ([]byte, error) {
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
	fasthttpadaptor.NewFastHTTPHandler(fiberApp.Handler())(w, r)
}
