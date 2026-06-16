<#macro show pageTitle="" tagline=true>
<div class="synapse-login-brand">
    <img src="${url.resourcesPath}/img/synapse.png" alt="" class="synapse-login-logo" width="72" height="72" />
    <div class="synapse-login-brand-text">
        <span class="synapse-login-name">Synapse</span>
        <#if tagline>
            <span class="synapse-login-tagline">DICOM Data Migration Router</span>
        </#if>
    </div>
    <#if pageTitle?has_content>
        <p class="synapse-login-welcome">${pageTitle}</p>
    </#if>
</div>
</#macro>
