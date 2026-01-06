import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Change "my-vite-app" to your GitHub repo name
export default defineConfig({
  plugins: [react()],
  base: '/edu_physics_visual_motion_tracking/',
})
