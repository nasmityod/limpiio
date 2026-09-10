module.exports = {
  apps: [
    {
      name: 'mundotech',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: '/var/www/mundotech',
      env: { NODE_ENV: 'production', PORT: 3000 },
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '500M',
    },
  ],
};
