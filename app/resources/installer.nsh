; ============================================================================
; Criarte Studio — o que o instalador do Windows faz a mais que o padrão.
; ============================================================================
; O padrão do electron-builder só troca a versão anterior quando ela está na
; mesma entrada de registo. Instalação antiga noutra pasta, noutro utilizador
; ou com o desinstalador partido ficava lá, e o cunhado acabava com três
; "Criarte Studio" no menu. Antes de instalar, isto procura todas e remove.

!macro criarteLimpar RAIZ SUF
  StrCpy $R0 0
  criarte_volta_${SUF}:
    IntOp $R4 $R4 + 1
    IntCmp $R4 300 criarte_fim_${SUF} 0 criarte_fim_${SUF}
    EnumRegKey $R1 ${RAIZ} "Software\Microsoft\Windows\CurrentVersion\Uninstall" $R0
    StrCmp $R1 "" criarte_fim_${SUF}
    ReadRegStr $R2 ${RAIZ} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "DisplayName"
    StrCpy $R3 $R2 14
    StrCmp $R3 "Criarte Studio" 0 criarte_seguinte_${SUF}
      ReadRegStr $R3 ${RAIZ} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "QuietUninstallString"
      StrCmp $R3 "" 0 criarte_executa_${SUF}
      ReadRegStr $R3 ${RAIZ} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "UninstallString"
      StrCmp $R3 "" criarte_apaga_${SUF}
      StrCpy $R3 "$R3 /S"
      criarte_executa_${SUF}:
        DetailPrint "A remover versão anterior: $R2"
        ExecWait '$R3'
      criarte_apaga_${SUF}:
        ; Desinstalador que falhou ou já não existe deixa a entrada órfã: sai à mão.
        DeleteRegKey ${RAIZ} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1"
        ; A lista encolheu: recomeça do início em vez de saltar uma entrada.
        StrCpy $R0 0
        Goto criarte_volta_${SUF}
  criarte_seguinte_${SUF}:
    IntOp $R0 $R0 + 1
    Goto criarte_volta_${SUF}
  criarte_fim_${SUF}:
!macroend

!macro customInit
  Push $R0
  Push $R1
  Push $R2
  Push $R3
  Push $R4
  StrCpy $R4 0
  SetRegView 64
  !insertmacro criarteLimpar HKCU cu64
  !insertmacro criarteLimpar HKLM lm64
  SetRegView 32
  !insertmacro criarteLimpar HKCU cu32
  !insertmacro criarteLimpar HKLM lm32
  SetRegView lastused
  ; Pasta padrão de instalações por utilizador que perderam o desinstalador.
  RMDir /r "$LOCALAPPDATA\Programs\criarte-studio"
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
!macroend

; Desinstalar à vista no menu Iniciar — além de Aplicações instaladas.
!macro customInstall
  CreateShortCut "$SMPROGRAMS\Desinstalar Criarte Studio.lnk" "$INSTDIR\${UNINSTALL_FILENAME}"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\Desinstalar Criarte Studio.lnk"
!macroend
