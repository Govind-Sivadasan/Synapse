<#import "template.ftl" as layout>
<#import "brand-header.ftl" as brand>
<@layout.registrationLayout displayInfo=true displayMessage=!messagesPerField.existsError('username'); section>
    <#if section = "header">
        <@brand.show pageTitle=msg("emailForgotTitle") />
    <#elseif section = "form">
        <form id="kc-reset-password-form" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post">
            <div class="${properties.kcFormGroupClass!}">
                <label for="username" class="${properties.kcLabelClass!}">
                    <span class="pf-v5-c-form__label-text">
                        <#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if>
                    </span>
                </label>
                <span class="${properties.kcInputClass!} ${messagesPerField.existsError('username')?then('pf-m-error', '')}">
                    <input type="text" id="username" name="username" autofocus value="${(auth.attemptedUsername!'')}"
                           aria-invalid="<#if messagesPerField.existsError('username')>true</#if>" />
                </span>
                <#if messagesPerField.existsError('username')>
                    <span id="input-error-username" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                        ${kcSanitize(messagesPerField.get('username'))?no_esc}
                    </span>
                </#if>
            </div>

            <div id="kc-form-buttons" class="${properties.kcFormButtonsClass!}">
                <div class="pf-v5-c-form__actions">
                    <input class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!}" type="submit" value="${msg("doSubmit")}" />
                    <a class="${properties.kcButtonClass!} ${properties.kcButtonDefaultClass!} ${properties.kcButtonBlockClass!}" href="${url.loginUrl}">${kcSanitize(msg("backToLogin"))?no_esc}</a>
                </div>
            </div>
        </form>
    <#elseif section = "info">
        <#if realm.duplicateEmailsAllowed>
            ${msg("emailInstructionUsername")}
        <#else>
            ${msg("emailInstruction")}
        </#if>
    </#if>
</@layout.registrationLayout>
