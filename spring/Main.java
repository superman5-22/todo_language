// Java Spring Boot — Deploy to Railway / Render / Fly.io
// Build: mvn package -DskipTests
// Run:   java -jar target/todo-spring.jar

package com.example.todo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.servlet.config.annotation.*;

import java.util.*;

@SpringBootApplication
public class Main {
    public static void main(String[] args) {
        SpringApplication.run(Main.class, args);
    }
}

@Configuration
class WebConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/spring/**")
                .allowedOrigins("*")
                .allowedMethods("GET", "POST", "PATCH", "DELETE", "OPTIONS");
    }

    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }
}

@RestController
@RequestMapping("/api/spring")
class TodoController {
    private final String supabaseUrl  = System.getenv("SUPABASE_URL");
    private final String supabaseKey  = System.getenv("SUPABASE_SERVICE_ROLE_KEY");
    private final RestTemplate rest   = new RestTemplate();

    private HttpHeaders sbHeaders(boolean withPrefer) {
        HttpHeaders h = new HttpHeaders();
        h.set("apikey", supabaseKey);
        h.set("Authorization", "Bearer " + supabaseKey);
        h.setContentType(MediaType.APPLICATION_JSON);
        if (withPrefer) h.set("Prefer", "return=representation");
        return h;
    }

    @GetMapping("/todos")
    public Map<String, Object> getTodos() {
        var entity = new HttpEntity<>(sbHeaders(false));
        var resp = rest.exchange(
            supabaseUrl + "/rest/v1/todos?select=*&order=created_at.desc",
            HttpMethod.GET, entity, List.class);
        return Map.of("todos", resp.getBody());
    }

    @PostMapping("/todos")
    public ResponseEntity<Map<String, Object>> createTodo(@RequestBody Map<String, Object> body) {
        String title = ((String) body.getOrDefault("title", "")).trim();
        if (title.isEmpty())
            return ResponseEntity.badRequest().body(Map.of("error", "title is required"));

        var payload = Map.of("title", title, "completed", false);
        var entity  = new HttpEntity<>(payload, sbHeaders(true));
        var resp = rest.exchange(
            supabaseUrl + "/rest/v1/todos",
            HttpMethod.POST, entity, List.class);
        List<?> data = resp.getBody();
        return ResponseEntity.status(201).body(Map.of("todo", data.get(0)));
    }

    @PatchMapping("/todos/{id}")
    public ResponseEntity<Map<String, Object>> updateTodo(
            @PathVariable String id, @RequestBody Map<String, Object> body) {
        Map<String, Object> update = new HashMap<>();
        if (body.containsKey("title"))     update.put("title",     body.get("title"));
        if (body.containsKey("completed")) update.put("completed", body.get("completed"));

        var entity = new HttpEntity<>(update, sbHeaders(true));
        var resp = rest.exchange(
            supabaseUrl + "/rest/v1/todos?id=eq." + id,
            HttpMethod.PATCH, entity, List.class);
        List<?> data = resp.getBody();
        if (data == null || data.isEmpty())
            return ResponseEntity.status(404).body(Map.of("error", "todo not found"));
        return ResponseEntity.ok(Map.of("todo", data.get(0)));
    }

    @DeleteMapping("/todos/{id}")
    public ResponseEntity<Map<String, Object>> deleteTodo(@PathVariable String id) {
        var entity = new HttpEntity<>(sbHeaders(false));
        var check = rest.exchange(
            supabaseUrl + "/rest/v1/todos?id=eq." + id + "&select=id",
            HttpMethod.GET, entity, List.class);
        List<?> existing = check.getBody();
        if (existing == null || existing.isEmpty())
            return ResponseEntity.status(404).body(Map.of("error", "todo not found"));

        rest.exchange(supabaseUrl + "/rest/v1/todos?id=eq." + id,
            HttpMethod.DELETE, entity, Void.class);
        return ResponseEntity.ok(Map.of("message", "deleted"));
    }
}
