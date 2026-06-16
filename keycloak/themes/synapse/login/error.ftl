<#import "template.ftl" as layout>
<#import "brand-header.ftl" as brand>
<@layout.registrationLayout displayMessage=false; section>
    <#if section = "header">
        <@brand.show pageTitle=msg("errorTitle") tagline=false />
    <#elseif section = "form">
        <div id="kc-error-message" class="synapse-error-body">
            <p class="instruction synapse-error-text">${kcSanitize(message.summary)?no_esc}</p>
            <#if skipLink??>
            <#else>
                <#if client?? && client.baseUrl?has_content>
                    <p class="synapse-error-actions">
                        <a id="backToApplication" class="synapse-btn-primary" href="${client.baseUrl}">
                            ${kcSanitize(msg("backToApplication"))?no_esc}
                        </a>
                    </p>
                <#else>
                    <p class="synapse-error-actions">
                        <a class="synapse-btn-primary" href="${url.loginUrl}">
                            ${kcSanitize(msg("doLogIn"))?no_esc}
                        </a>
                    </p>
                </#if>
            </#if>
        </div>
    </#if>
</@layout.registrationLayout>
