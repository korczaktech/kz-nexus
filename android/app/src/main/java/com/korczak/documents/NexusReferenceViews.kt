package com.korczak.documents

import android.content.Context
import android.graphics.*
import android.view.View
import kotlin.math.min

internal enum class NexusIcon { HOME, FOLDER, GRID, DOTS, PAGE_PLUS, UPLOAD, PEOPLE, SHIELD, CLOUD, CLOCK, CHEVRON, BELL, PLUS }

internal class NexusMarkView(context: Context) : View(context) {
    private val d = resources.displayMetrics.density
    override fun onDraw(c: Canvas) {
        val s = min(width, height).toFloat()
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.color = Color.rgb(3,5,9); c.drawRoundRect(0f,0f,s,s,s*.27f,s*.27f,p)
        p.shader = RadialGradient(s*.35f,s*.65f,s*.33f,intArrayOf(Color.argb(180,123,47,247),Color.TRANSPARENT),null,Shader.TileMode.CLAMP)
        c.drawCircle(s*.35f,s*.65f,s*.33f,p)
        p.shader = RadialGradient(s*.68f,s*.35f,s*.30f,intArrayOf(Color.argb(150,209,22,63),Color.TRANSPARENT),null,Shader.TileMode.CLAMP)
        c.drawCircle(s*.68f,s*.35f,s*.30f,p)
        p.shader=null; p.style=Paint.Style.STROKE; p.strokeWidth=s*.08f; p.strokeCap=Paint.Cap.ROUND; p.strokeJoin=Paint.Join.ROUND; p.color=Color.rgb(79,131,255)
        val n=Path(); n.moveTo(s*.33f,s*.70f); n.lineTo(s*.33f,s*.30f); n.lineTo(s*.68f,s*.70f); n.lineTo(s*.68f,s*.30f); c.drawPath(n,p)
    }
}

internal class NexusOrbView(context: Context) : View(context) {
    private val d = resources.displayMetrics.density
    override fun onDraw(c: Canvas) {
        val scale=min(width/(180f*d),height/(150f*d)); val ox=(width-180f*d*scale)/2f; val oy=(height-150f*d*scale)/2f; val cx=ox+90f*d*scale; val cy=oy+75f*d*scale; val p=Paint(Paint.ANTI_ALIAS_FLAG)
        fun X(v:Float)=ox+v*d*scale
        fun Y(v:Float)=oy+v*d*scale
        fun glow(col:Int,a:Int,x:Float,y:Float,r:Float){p.shader=RadialGradient(X(x),Y(y),r*d*scale,intArrayOf(Color.argb(a,Color.red(col),Color.green(col),Color.blue(col)),Color.TRANSPARENT),null,Shader.TileMode.CLAMP);c.drawCircle(X(x),Y(y),r*d*scale,p)}
        glow(Color.rgb(47,107,255),115,95f,75f,62f); glow(Color.rgb(123,47,247),128,80f,90f,34f); glow(Color.rgb(209,22,63),102,112f,58f,30f)
        p.shader=null;p.style=Paint.Style.STROKE;p.strokeWidth=1.2f*d*scale;p.color=Color.argb(128,91,140,255)
        c.save();c.rotate(-24f,cx,cy);c.drawOval(cx-88*d*scale,cy-26*d*scale,cx+88*d*scale,cy+26*d*scale,p);c.restore()
        p.color=Color.argb(77,91,140,255);c.save();c.rotate(32f,cx,cy);c.drawOval(cx-80*d*scale,cy-22*d*scale,cx+80*d*scale,cy+22*d*scale,p);c.restore()
        p.color=Color.argb(115,91,140,255);c.drawCircle(cx,cy,40*d*scale,p)
        p.color=Color.rgb(79,131,255);p.strokeWidth=9*d*scale;p.strokeCap=Paint.Cap.ROUND;p.strokeJoin=Paint.Join.ROUND
        val n=Path();n.moveTo(X(77f),Y(98f));n.lineTo(X(77f),Y(52f));n.lineTo(X(113f),Y(98f));n.lineTo(X(113f),Y(52f));c.drawPath(n,p)
        p.style=Paint.Style.FILL;c.drawCircle(X(170f),Y(40f),4*d*scale,p)
    }
}

internal class NexusStorageRingView(context: Context, private val pct: Int) : View(context) {
    private val d=resources.displayMetrics.density
    override fun onDraw(c:Canvas){
        val p=Paint(Paint.ANTI_ALIAS_FLAG);p.style=Paint.Style.STROKE;p.strokeWidth=8*d
        val w=p.strokeWidth/2;val rect=RectF(w,w,width-w,height-w)
        p.color=Color.rgb(23,35,63);c.drawArc(rect,0f,360f,false,p)
        p.color=Color.rgb(47,107,255);p.strokeCap=Paint.Cap.ROUND;c.drawArc(rect,-90f,pct*3.6f,false,p)
        p.style=Paint.Style.FILL;p.color=Color.rgb(234,240,255);p.textAlign=Paint.Align.CENTER;p.textSize=15*d;p.typeface=Typeface.create("sans-serif",Typeface.BOLD)
        c.drawText("$pct%",width/2f,height/2f-(p.ascent()+p.descent())/2f,p)
    }
}

internal class NexusIconView(context: Context, private val icon:NexusIcon, private val color:Int, private val sizeDp:Int=22) : View(context) {
    private val d=resources.displayMetrics.density
    override fun onDraw(c:Canvas){
        val target=sizeDp*d;val u=min(width,height).coerceAtMost(target)/24f;val p=Paint(Paint.ANTI_ALIAS_FLAG);p.style=Paint.Style.STROKE;p.strokeWidth=1.7f*u;p.strokeCap=Paint.Cap.ROUND;p.strokeJoin=Paint.Join.ROUND;p.color=color
        fun path(block:Path.()->Unit)=c.drawPath(Path().apply(block),p)
        fun mv(x:Float,y:Float)=x*u to y*u
        when(icon){
            NexusIcon.HOME->path{moveTo(mv(3.4f,11.5f).first,mv(3.4f,11.5f).second);lineTo(mv(12f,3.8f).first,mv(12f,3.8f).second);lineTo(mv(20.6f,11.5f).first,mv(20.6f,11.5f).second);moveTo(mv(6f,10f).first,mv(6f,10f).second);lineTo(mv(6f,20f).first,mv(6f,20f).second);lineTo(mv(18f,20f).first,mv(18f,20f).second);lineTo(mv(18f,10f).first,mv(18f,10f).second)}
            NexusIcon.FOLDER->{c.drawRoundRect(3*u,7*u,21*u,20*u,2.5f*u,2.5f*u,p);path{moveTo(4*u,4.5f*u);lineTo(10*u,4.5f*u)}}
            NexusIcon.GRID->{for(x in floatArrayOf(3.4f,13.4f))for(y in floatArrayOf(3.4f,13.4f))c.drawRoundRect(x*u,y*u,(x+7.2f)*u,(y+7.2f)*u,2*u,2*u,p)}
            NexusIcon.DOTS->{p.style=Paint.Style.FILL;for(x in floatArrayOf(5.5f,12f,18.5f))c.drawCircle(x*u,12*u,1.7f*u,p);p.style=Paint.Style.STROKE}
            NexusIcon.PAGE_PLUS->{path{moveTo(6*u,3*u);lineTo(14*u,3*u);lineTo(18*u,7*u);lineTo(18*u,21*u);lineTo(6*u,21*u);close();moveTo(14*u,3*u);lineTo(14*u,7*u);lineTo(18*u,7*u);moveTo(12*u,11*u);lineTo(12*u,17*u);moveTo(9*u,14*u);lineTo(15*u,14*u)}}
            NexusIcon.UPLOAD->{path{moveTo(12*u,16*u);lineTo(12*u,5*u);moveTo(8*u,9*u);lineTo(12*u,5*u);lineTo(16*u,9*u);moveTo(5*u,16*u);lineTo(5*u,19*u);lineTo(19*u,19*u);lineTo(19*u,16*u)}}
            NexusIcon.PEOPLE->{c.drawCircle(9*u,8*u,3.2f*u,p);c.drawCircle(17*u,9*u,2.4f*u,p);path{moveTo(3.5f*u,20*u);quadTo(3.5f*u,14.5f*u,9*u,14.5f*u);quadTo(14.5f*u,14.5f*u,14.5f*u,20*u);moveTo(17*u,14.5f*u);quadTo(20.5f*u,14.5f*u,20.5f*u,19*u)}}
            NexusIcon.SHIELD->{path{moveTo(12*u,3*u);lineTo(19*u,6*u);lineTo(19*u,11*u);quadTo(19*u,16.5f*u,12*u,21*u);quadTo(5*u,16.5f*u,5*u,11*u);lineTo(5*u,6*u);close()}}
            NexusIcon.CLOUD->{path{moveTo(7*u,18*u);quadTo(3.5f*u,18*u,3.5f*u,11*u);quadTo(3.5f*u,10.5f*u,8*u,10.5f*u);quadTo(8.5f*u,6*u,16*u,6*u);quadTo(17*u,10.5f*u,21*u,10.5f*u);quadTo(21*u,18*u,17*u,18*u);close()}}
            NexusIcon.CLOCK->{c.drawCircle(12*u,12*u,9*u,p);path{moveTo(12*u,7*u);lineTo(12*u,12*u);lineTo(15*u,14*u)}}
            NexusIcon.CHEVRON->{path{moveTo(9*u,5*u);lineTo(16*u,12*u);lineTo(9*u,19*u)}}
            NexusIcon.BELL->{path{moveTo(6*u,17*u);lineTo(6*u,11*u);quadTo(6*u,4*u,18*u,4*u);quadTo(18*u,11*u,18*u,17*u);lineTo(19.5f*u,19*u);lineTo(4.5f*u,19*u);close();moveTo(10*u,21*u);lineTo(14*u,21*u)}}
            NexusIcon.PLUS->{path{moveTo(12*u,4*u);lineTo(12*u,20*u);moveTo(4*u,12*u);lineTo(20*u,12*u)}}
        }
    }
}
