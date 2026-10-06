const VERSION=1;
export function createDocumentModel(input={}){
  const now=new Date().toISOString();
  return normalizeDocumentModel({
    id:input.id??null,
    name:String(input.name||"Sem título"),
    type:String(input.document_type||input.type||"text"),
    description:String(input.description||""),
    storage:input.storage||"local",
    content:{html:String(input.content?.html??input.content??"")},
    metadata:{createdAt:input.metadata?.createdAt||now,updatedAt:input.metadata?.updatedAt||now},
    version:VERSION
  });
}
export function normalizeDocumentModel(input={}){
  const html=typeof input.content==="object"&&input.content!==null?String(input.content.html||""):String(input.content||"");
  return {
    id:input.id??null,
    name:String(input.name||"Sem título"),
    type:String(input.type||input.document_type||"text"),
    description:String(input.description||""),
    storage:input.storage||"local",
    content:{html},
    metadata:{
      createdAt:input.metadata?.createdAt||new Date().toISOString(),
      updatedAt:input.metadata?.updatedAt||input.updated_at||new Date().toISOString()
    },
    version:Number(input.version)||VERSION
  };
}
export function updateDocumentModel(model,patch={}){
  const next=normalizeDocumentModel({...model,...patch,content:{html:patch.content?.html??model?.content?.html??""}});
  next.metadata={...model.metadata,...patch.metadata,updatedAt:new Date().toISOString()};
  return next;
}
export function serializeDocumentModel(model){return String(model?.content?.html||"");}
export function modelFromServerDocument(doc,storage="local"){
  return normalizeDocumentModel({...doc,type:doc.document_type,storage,content:doc.content});
}
