package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"text/template"
	"time"
)

type Config struct {
	Url string
}

func categories() []string {
	var all []string

	files, err := ioutil.ReadDir("./static/themes")
	if err != nil {
		log.Fatal(err)
	}

	for _, f := range files {
		all = append(all, f.Name())
	}

	return all
}

func indexHandler(w http.ResponseWriter, r *http.Request) {
	t, _ := template.ParseFiles("./index.html")
	t.Execute(w, categories())
}

func saveHandler(w http.ResponseWriter, r *http.Request) {
	decoder := json.NewDecoder(r.Body)
	var data struct {
		Id    string
		Email string
		Img   string
	}

	err := decoder.Decode(&data)
	if err != nil {
		log.Println(err)
	}

	bytes, err := json.Marshal(data)
	if err != nil {
		log.Println(err)
	}

	err = ioutil.WriteFile("./selfies/"+fmt.Sprintf("%d", time.Now().Unix())+".json", bytes, 0644)
	if err != nil {
		log.Println(err)
	}
}

func main() {
	var cfg Config
	j, _ := ioutil.ReadFile("config.json")
	err := json.Unmarshal(j, &cfg)
	if err != nil {
		log.Fatal(err)
	}

	http.HandleFunc("/", indexHandler)
	http.HandleFunc("/save", saveHandler)

	http.HandleFunc("/static/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, r.URL.Path[1:])
	})

	http.HandleFunc("/selfies/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, r.URL.Path[1:])
	})

	log.Fatal(http.ListenAndServe(cfg.Url, nil))
}
