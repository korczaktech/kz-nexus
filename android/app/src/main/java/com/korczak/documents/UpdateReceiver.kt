package com.korczak.documents

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.widget.Toast

class UpdateReceiver:BroadcastReceiver(){
    override fun onReceive(context:Context,intent:Intent){
        val status=intent.getIntExtra("android.content.pm.extra.STATUS",-1)
        val message=intent.getStringExtra("android.content.pm.extra.STATUS_MESSAGE")?:""
        if(status!=0) Toast.makeText(context,"Atualização: "+message,Toast.LENGTH_LONG).show()
    }
}
