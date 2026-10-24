(function(){
  var box=document.getElementById('kdlb'),big=box.querySelector('img'),cap=box.querySelector('.kdlb__t');
  var list=[],cur=0;
  function collect(){list=[].slice.call(document.querySelectorAll('.card__img img'));}
  function show(i){
    if(!list.length)return;
    cur=(i+list.length)%list.length;
    var im=list[cur],card=im.closest('.card, article, li');
    big.src=im.currentSrc||im.src;
    var t=card&&card.querySelector('h3,.cardtitle,.cardname');
    cap.textContent=t?t.textContent.trim():(im.alt||'');
    box.classList.add('on');box.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
  }
  function close(){box.classList.remove('on');box.setAttribute('aria-hidden','true');document.body.style.overflow='';}
  document.addEventListener('click',function(e){
    var im=e.target.closest&&e.target.closest('.cardimg img, .heroimg img');
    if(!im||box.contains(e.target))return;
    e.stopPropagation();e.preventDefault();
    collect();
    var i=list.indexOf(im);
    if(i<0){list=[im];i=0;}
    show(i);
  },true);
  box.addEventListener('click',function(e){
    if(e.target.closest('.kdlb__n')){show(cur+1);return;}
    if(e.target.closest('.kdlb__p')){show(cur-1);return;}
    close();
  });
  document.addEventListener('keydown',function(e){
    if(!box.classList.contains('on'))return;
    if(e.key==='Escape')close();
    else if(e.key==='ArrowRight')show(cur+1);
    else if(e.key==='ArrowLeft')show(cur-1);
  });
  var x0=null;
  box.addEventListener('touchstart',function(e){x0=e.touches[0].clientX;},{passive:true});
  box.addEventListener('touchend',function(e){
    if(x0===null)return;var dx=e.changedTouches[0].clientX-x0;x0=null;
    if(Math.abs(dx)>60){e.preventDefault();show(cur+(dx<0?1:-1));}
  });
})();
