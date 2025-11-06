import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log, closeVite } from "./vite";
import type { Socket } from "net";
import 'dotenv/config';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Track active connections
  const connections = new Set<Socket>();
  
  server.on('connection', (socket) => {
    connections.add(socket);
    socket.on('close', () => {
      connections.delete(socket);
    });
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Add graceful shutdown handler
  async function shutdownGracefully() {
    log('Shutting down gracefully...');
    
    // Close Vite server first (in development mode)
    if (app.get("env") === "development") {
      try {
        await closeVite();
        log('Vite server closed');
      } catch (error) {
        log(`Error closing Vite: ${error}`);
      }
    }

    // Close all active connections immediately
    connections.forEach((socket) => {
      socket.destroy();
    });

    // Close the server
    server.close(() => {
      log('Server closed');
      process.exit(0);
    });

    // Force shutdown after 2 seconds if server hasn't closed
    setTimeout(() => {
      log('Could not close connections in time, forcefully shutting down');
      // Destroy any remaining connections
      connections.forEach((socket) => {
        socket.destroy();
      });
      process.exit(1);
    }, 2000);
  }

  // Listen for termination signals
  process.on('SIGTERM', shutdownGracefully);
  process.on('SIGINT', shutdownGracefully);

  // Start the server with error handling
  const PORT = 5000;
  function startServer() {
    server.listen(PORT, "0.0.0.0", () => {
      log(`Server running on port ${PORT}`);
    }).on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        log(`Port ${PORT} is already in use. Retrying in 1 second...`);
        setTimeout(startServer, 1000);
      } else {
        log(`Failed to start server: ${error.message}`);
        process.exit(1);
      }
    });
  }

  startServer();
})();