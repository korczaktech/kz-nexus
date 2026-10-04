package com.korczak.documents

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

data class ApiResult(val code: Int, val body: String)

class ApiClient(private val session: SessionStore) {
    private val base = "https://kz-nexus.onrender.com"
    fun request(method:String,path:String,body:String?=null):ApiResult{
        val c=(URL(base+path).openConnection() as HttpURLConnection).apply{
            requestMethod=method; connectTimeout=20000; readTimeout=60000
            setRequestProperty("Accept","application/json")
            session.token?.let{setRequestProperty("Authorization","Bearer "+it)}
            if(body!=null){doOutput=true;setRequestProperty("Content-Type","application/json")}
        }
        return try{
            if(body!=null)c.outputStream.use{it.write(body.toByteArray(Charsets.UTF_8))}
            val status=c.responseCode
            val stream=if(status>=400)c.errorStream else c.inputStream
            val text=stream?.use{BufferedReader(InputStreamReader(it)).readText()}?:""
            ApiResult(status,text)
        }finally{c.disconnect()}
    }
    fun login(e:String,p:String)=request("POST","/api/v1/auth/login",JSONObject().put("email",e).put("password",p).toString())
    fun register(n:String,e:String,p:String)=request("POST","/api/v1/auth/register",JSONObject().put("name",n).put("email",e).put("password",p).toString())
    fun me()=request("GET","/api/v1/users/me")
    fun documents()=request("GET","/api/v1/documents")
    fun folders()=request("GET","/api/v1/folders")
    fun favorites()=request("GET","/api/v1/favorites")
    fun trash()=request("GET","/api/v1/trash")
    fun search(q:String)=request("GET","/api/v1/search?q="+URLEncoder.encode(q,"UTF-8")+"&page=1&page_size=50")
    fun createDocument(n:String,t:String,c:String)=request("POST","/api/v1/documents",JSONObject().put("name",n).put("document_type",t).put("content",c).toString())
    fun createFolder(n:String)=request("POST","/api/v1/folders",JSONObject().put("name",n).toString())
    fun deleteDocument(id:String)=request("DELETE","/api/v1/documents/"+id)
    fun restoreDocument(id:String)=request("POST","/api/v1/documents/"+id+"/restore","{}")
    fun permanentDelete(id:String)=request("DELETE","/api/v1/documents/"+id+"/permanent")
    fun logout()=request("POST","/api/v1/auth/logout","{}")
    fun errorMessage(r:ApiResult):String=try{JSONObject(r.body).optJSONObject("error")?.optString("message")?.takeIf{it.isNotBlank()}?:"Erro HTTP "+r.code}catch(_:Exception){"Erro HTTP "+r.code}
    fun saveSession(r:ApiResult){
        val j=JSONObject(r.body)
        val token = when {
            j.has("token") && !j.isNull("token") -> j.optString("token", "")
            j.has("access_token") && !j.isNull("access_token") -> j.optString("access_token", "")
            else -> ""
        }.trim()
        if (token.isBlank()) throw IllegalStateException("Resposta de login sem token")
        val user = when {
            j.opt("user") is JSONObject -> j.getJSONObject("user")
            j.opt("user") is String -> JSONObject(j.getString("user"))
            else -> throw IllegalStateException("Resposta de login sem usuário")
        }
        session.token = token
        session.userJson = user.toString()
    }
    fun listText(body:String):String=try{val a=JSONArray(body);buildString{for(i in 0 until a.length()){val o=a.optJSONObject(i)?:continue;append("• ").append(o.optString("name",o.optString("id"))).append("\n")}}.ifBlank{"Nenhum item encontrado."}}catch(_:Exception){body}
}
