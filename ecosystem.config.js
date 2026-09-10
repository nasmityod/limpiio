// Nombre de la instancia en el servidor. Debe coincidir con el APP_SLUG que
// usan scripts/deploy-vps.sh, deploy/crontab.vps y el sitio de nginx.
const APP_SLUG = process.env.APP_SLUG || 'storefront';

module.exports = {
  apps: [
    {
      name: APP_SLUG,
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: `/var/www/${APP_SLUG}`,
      env: { NODE_ENV: 'production', PORT: 3000 },
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '500M',
    },
  ],
};
