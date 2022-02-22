// import { createApp } from 'vue'
import App from './App.vue'
import Vue from 'vue';



// createApp(App).mount('#app')

import VueWasm from 'vue-wasm';
import CuraModule from '../../../../CuraEngine.wasm';

const init = async () => {
  await VueWasm(Vue, { modules: { cura: CuraModule } });
  /* eslint-disable*/
  new Vue({
    el: '#app',
    template: '<App/>',
    components: { App },
  });
};

init();
