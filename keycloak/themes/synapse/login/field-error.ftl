<#macro show text id="">
  <span<#if id?has_content> id="${id}"</#if> class="synapse-field-error pf-v5-c-helper-text__item-text pf-m-error kc-feedback-text" aria-live="polite">
    <span class="synapse-field-error__icon" aria-hidden="true"><i class="fas fa-exclamation-circle"></i></span>
    <span class="synapse-field-error__text">${text}</span>
  </span>
</#macro>
