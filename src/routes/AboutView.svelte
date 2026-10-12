<script lang="ts">
  import { manifest } from '../lib/db/manifest.svelte';
  const m = $derived(manifest.value);
  import { t } from '../lib/text/t';
  import Text from '../lib/components/Text.svelte';
</script>

<section class="view about">
  <div>
    <h1>{t('about.title')}</h1>
    <p class="muted">{t('about.tagline')}</p>
  </div>

  <div class="card prose">
    <h3>{t('about.what.title')}</h3>
    <p><Text k="about.what.1" /></p>
    <p><Text k="about.what.2" /></p>
  </div>

  <div class="card prose">
    <h3>{t('about.method.title')}</h3>
    <p><Text k="about.method.1" vars={{ ref_year: m?.ref_year ?? 2019 }} /></p>
    <p><Text k="about.method.2" /></p>
  </div>

  <div class="card prose">
    <h3>{t('about.how.title')}</h3>
    <p><Text k="about.how.1" /></p>
  </div>

  <div class="card">
    <h3>{t('about.build.title')}</h3>
    {#if m}
      <dl class="num">
        <dt>{t('about.build.data')}</dt><dd class="mono">{m.built}</dd>
        <dt>{t('about.build.ref')}</dt><dd>{m.ref_year}</dd>
        <dt>{t('about.build.fua')}</dt><dd>{m.years.fua[0]}–{m.years.fua[1]}</dd>
        <dt>{t('about.build.lai')}</dt><dd>{m.years.lai[0]}–{m.years.lai[1]}</dd>
        <dt>{t('about.build.rai')}</dt><dd>{m.years.rai[0]}–{m.years.rai[1]}</dd>
      </dl>
      <h3 class="cite-h">{t('about.credits.title')}</h3>
      <p class="cite"><Text k="about.credits.text" /></p>
    {:else}
      <p class="muted">{manifest.status === 'loading' ? t('about.loading') : t('about.nodata')}</p>
    {/if}
  </div>
</section>

<style>

  .card h3 { margin-bottom: 6px; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 0; }
  dt { color: var(--fg-2); }
  dd { margin: 0; }
  .cite-h { margin-top: 14px; }
  .cite { font-size: 13px; margin-top: 4px; }
</style>
