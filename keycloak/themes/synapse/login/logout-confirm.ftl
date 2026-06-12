<#import "template.ftl" as layout>
<@layout.registrationLayout; section>
    <#if section = "header">
        <div class="synapse-login-brand">
            <img src="${url.resourcesPath}/img/synapse-logo.svg" alt="" class="synapse-login-logo" width="48" height="48" />
            <div class="synapse-login-brand-text">
                <span class="synapse-login-name">Synapse</span>
            </div>
            <p class="synapse-login-welcome">${msg("logoutConfirmTitle")}</p>
        </div>
    <#elseif section = "form">
        <div id="kc-logout-confirm" class="synapse-error-body">
            <p class="instruction synapse-error-text">${msg("logoutConfirmHeader")}</p>

            <form class="form-actions" action="${url.logoutConfirmAction}" method="POST">
                <input type="hidden" name="session_code" value="${logoutConfirm.code}">
                <div id="kc-form-buttons" class="${properties.kcFormGroupClass!}">
                    <input tabindex="4"
                           class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}"
                           name="confirmLogout" id="kc-logout" type="submit" value="${msg("doLogout")}"/>
                </div>
            </form>

            <#if !logoutConfirm.skipLink && (client.baseUrl)?has_content>
                <p class="synapse-error-actions" style="margin-top: 1rem !important;">
                    <a class="synapse-btn-secondary" href="${client.baseUrl}">${kcSanitize(msg("backToApplication"))?no_esc}</a>
                </p>
            </#if>
        </div>
    </#if>
</@layout.registrationLayout>
