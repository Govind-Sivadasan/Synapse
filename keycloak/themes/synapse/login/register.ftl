<#import "template.ftl" as layout>
<#import "brand-header.ftl" as brand>
<#import "field-error.ftl" as fieldError>
<#import "user-profile-commons.ftl" as userProfileCommons>
<#import "register-commons.ftl" as registerCommons>
<@layout.registrationLayout displayMessage=messagesPerField.exists('global') displayRequiredFields=true; section>
    <#if section = "header">
        <@brand.show pageTitle=msg("registerTitle") />
    <#elseif section = "form">
        <form id="kc-register-form" class="${properties.kcFormClass!}" action="${url.registrationAction}" method="post">
            <@userProfileCommons.userProfileFormFields; callback, attribute>
                <#if callback = "afterField">
                    <#if passwordRequired?? && (attribute.name == 'username' || (attribute.name == 'email' && realm.registrationEmailAsUsername))>
                        <div class="${properties.kcFormGroupClass!}">
                            <label for="password" class="${properties.kcLabelClass!}">
                                <span class="pf-v5-c-form__label-text">
                                    ${msg("password")}
                                    <span class="pf-v5-c-form__label-required" aria-hidden="true">&#42;</span>
                                </span>
                            </label>
                            <div class="${properties.kcInputGroup!}">
                                <span class="${properties.kcInputClass!}">
                                    <input type="password" id="password" name="password" autocomplete="new-password"
                                           aria-invalid="<#if messagesPerField.existsError('password','password-confirm')>true</#if>" />
                                </span>
                                <button class="${properties.kcFormPasswordVisibilityButtonClass!}" type="button" aria-label="${msg('showPassword')}"
                                        aria-controls="password" data-password-toggle
                                        data-icon-show="${properties.kcFormPasswordVisibilityIconShow!}" data-icon-hide="${properties.kcFormPasswordVisibilityIconHide!}"
                                        data-label-show="${msg('showPassword')}" data-label-hide="${msg('hidePassword')}">
                                    <i class="${properties.kcFormPasswordVisibilityIconShow!}" aria-hidden="true"></i>
                                </button>
                            </div>
                            <#if messagesPerField.existsError('password')>
                                <@fieldError.show id="input-error-password" text=kcSanitize(messagesPerField.get('password'))?no_esc />
                            </#if>
                        </div>
                        <div class="${properties.kcFormGroupClass!}">
                            <label for="password-confirm" class="${properties.kcLabelClass!}">
                                <span class="pf-v5-c-form__label-text">
                                    ${msg("passwordConfirm")}
                                    <span class="pf-v5-c-form__label-required" aria-hidden="true">&#42;</span>
                                </span>
                            </label>
                            <div class="${properties.kcInputGroup!}">
                                <span class="${properties.kcInputClass!}">
                                    <input type="password" id="password-confirm" name="password-confirm"
                                           aria-invalid="<#if messagesPerField.existsError('password-confirm')>true</#if>" />
                                </span>
                                <button class="${properties.kcFormPasswordVisibilityButtonClass!}" type="button" aria-label="${msg('showPassword')}"
                                        aria-controls="password-confirm" data-password-toggle
                                        data-icon-show="${properties.kcFormPasswordVisibilityIconShow!}" data-icon-hide="${properties.kcFormPasswordVisibilityIconHide!}"
                                        data-label-show="${msg('showPassword')}" data-label-hide="${msg('hidePassword')}">
                                    <i class="${properties.kcFormPasswordVisibilityIconShow!}" aria-hidden="true"></i>
                                </button>
                            </div>
                            <#if messagesPerField.existsError('password-confirm')>
                                <@fieldError.show id="input-error-password-confirm" text=kcSanitize(messagesPerField.get('password-confirm'))?no_esc />
                            </#if>
                        </div>
                    </#if>
                </#if>
            </@userProfileCommons.userProfileFormFields>

            <@registerCommons.termsAcceptance/>

            <#if recaptchaRequired??>
                <div class="form-group">
                    <div class="${properties.kcInputWrapperClass!}">
                        <div class="g-recaptcha" data-size="compact" data-sitekey="${recaptchaSiteKey}"></div>
                    </div>
                </div>
            </#if>

            <div id="kc-form-buttons" class="${properties.kcFormButtonsClass!}">
                <div class="pf-v5-c-form__actions">
                    <input class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!}" type="submit" value="${msg("doRegister")}"/>
                    <a class="${properties.kcButtonClass!} ${properties.kcButtonDefaultClass!} ${properties.kcButtonBlockClass!}" href="${url.loginUrl}">${kcSanitize(msg("backToLogin"))?no_esc}</a>
                </div>
            </div>
        </form>
        <script type="module" src="${url.resourcesPath}/js/passwordVisibility.js"></script>
    </#if>
</@layout.registrationLayout>
