# Transações

`editor.exec([cmd1, cmd2, ...])`: valida entradas → aplica sobre estado de trabalho → valida invariantes do resultado → só então confirma, registra no histórico e emite eventos. Qualquer falha devolve `TRANSACTION_REJECTED` (com a causa em `details`) e o estado confirmado permanece idêntico (testado, inclusive falha na 2ª operação e por propriedade com sementes). Listeners rodam depois da confirmação; erro de listener vai para `onListenerError` e não desfaz nada.
