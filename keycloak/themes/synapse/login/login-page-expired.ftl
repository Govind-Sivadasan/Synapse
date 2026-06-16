<#import "template.ftl" as layout>
<#import "brand-header.ftl" as brand>
<@layout.registrationLayout; section>
    <#if section = "header">
        <@brand.show pageTitle=msg("pageExpiredTitle") />
    <#elseif section = "form">
        <p id="instruction1" class="synapse-page-message">
            ${msg("pageExpiredMsg1")}
            <a id="loginRestartLink" href="${url.loginRestartFlowUrl}">${msg("doClickHere")}</a>.
        </p>
        <p id="instruction2" class="synapse-page-message synapse-page-message--muted">
            ${msg("pageExpiredMsg2")}
            <a id="loginContinueLink" href="${url.loginAction}">${msg("doClickHere")}</a>.
        </p>
    </#if>
</@layout.registrationLayout>
