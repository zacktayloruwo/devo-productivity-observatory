import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { installProseColumns } from './lib/util/columns';

const app = mount(App, { target: document.getElementById('app')! });
installProseColumns();
export default app;
