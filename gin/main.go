// Go Gin — Vercel Serverless Function
package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

var (
	ginApp      *gin.Engine
	supabaseURL = os.Getenv("SUPABASE_URL")
	supabaseKey = os.Getenv("SUPABASE_SERVICE_ROLE_KEY")
)

func init() {
	gin.SetMode(gin.ReleaseMode)
	ginApp = gin.New()

	ginApp.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(200)
			return
		}
		c.Next()
	})

	api := ginApp.Group("/api/gin")

	api.GET("/todos", func(c *gin.Context) {
		data, err := sbRequest("/todos?select=*&order=created_at.desc", "GET", nil, "")
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		var todos []json.RawMessage
		json.Unmarshal(data, &todos)
		c.JSON(200, gin.H{"todos": todos})
	})

	api.POST("/todos", func(c *gin.Context) {
		var body map[string]interface{}
		c.ShouldBindJSON(&body)
		title, _ := body["title"].(string)
		if strings.TrimSpace(title) == "" {
			c.JSON(400, gin.H{"error": "title is required"})
			return
		}
		data, err := sbRequest("/todos", "POST",
			map[string]interface{}{"title": strings.TrimSpace(title), "completed": false},
			"return=representation")
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		var created []json.RawMessage
		json.Unmarshal(data, &created)
		c.JSON(201, gin.H{"todo": created[0]})
	})

	api.PATCH("/todos/:id", func(c *gin.Context) {
		id := c.Param("id")
		var body map[string]interface{}
		c.ShouldBindJSON(&body)
		update := map[string]interface{}{}
		if v, ok := body["title"]; ok {
			update["title"] = v
		}
		if v, ok := body["completed"]; ok {
			update["completed"] = v
		}
		data, err := sbRequest(fmt.Sprintf("/todos?id=eq.%s", id), "PATCH",
			update, "return=representation")
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		var updated []json.RawMessage
		json.Unmarshal(data, &updated)
		if len(updated) == 0 {
			c.JSON(404, gin.H{"error": "todo not found"})
			return
		}
		c.JSON(200, gin.H{"todo": updated[0]})
	})

	api.DELETE("/todos/:id", func(c *gin.Context) {
		id := c.Param("id")
		check, err := sbRequest(fmt.Sprintf("/todos?id=eq.%s&select=id", id), "GET", nil, "")
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		var existing []json.RawMessage
		json.Unmarshal(check, &existing)
		if len(existing) == 0 {
			c.JSON(404, gin.H{"error": "todo not found"})
			return
		}
		sbRequest(fmt.Sprintf("/todos?id=eq.%s", id), "DELETE", nil, "")
		c.JSON(200, gin.H{"message": "deleted"})
	})
}

func sbRequest(path, method string, body interface{}, prefer string) ([]byte, error) {
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
	ginApp.ServeHTTP(w, r)
}
