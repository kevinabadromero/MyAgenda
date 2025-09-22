module.exports = {
    apps: [
      {
        name: "myagenda-api",
        script: "index.js",
        cwd: "/home/MyAgenda/Backend",
        env_file: "/home/MyAgenda/Backend/.env",
        env: { NODE_ENV: "production" }
      }
    ]
  }